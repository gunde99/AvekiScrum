using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.TeamFoundation.Core.WebApi.Types;
using Microsoft.TeamFoundation.Work.WebApi;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Domain.Entities;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps.Entities;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal sealed class AzureDevOpsBoardsClient : IAzureDevOpsBoardsClient
    {
        private readonly IAzureDevOpsRestClient _rest;
        private readonly IAzureDevOpsConnectionProvider _connectionProvider;
        private readonly ILogger<AzureDevOpsBoardsClient> _logger;

        private const int BatchSize = 20;

        private enum WorkItemFieldProfile
        {
            Base,
            Full
        }

        // Fields required for lightweight board/iteration views (WorkItemDto)
        private static readonly string[] WorkItemBaseFields =
        {
            "System.Id",
            "System.Title",
            "System.State",
            "System.WorkItemType",
            "System.AssignedTo",
            "System.CreatedBy",
            "System.CreatedDate",
            "System.ChangedDate",
            "Microsoft.VSTS.Common.StateChangeDate",
            "System.AreaPath",
            "System.IterationPath",
            "System.Tags",
            "Microsoft.VSTS.Common.Priority",
            "Microsoft.VSTS.Common.Severity",
            "Microsoft.VSTS.Scheduling.StoryPoints",
            "Microsoft.VSTS.Common.Activity",
            "Microsoft.VSTS.CMMI.Blocked",
            "Custom.AssignedTeam",
            "Custom.Source",
            "Custom.Stakeholders",
            "Custom.Externallink",
            "Custom.DevelopmentPartner"
        };

        // Superset for detailed views (WorkItemWithFields)
        private static readonly string[] WorkItemFullFields =
        {
            "System.Id",
            "System.Title",
            "System.State",
            "System.WorkItemType",
            "System.TeamProject",
            "System.AssignedTo",
            "System.CreatedDate",
            "System.CreatedBy",
            "System.ChangedDate",
            "Microsoft.VSTS.Common.StateChangeDate",
            "System.ChangedBy",
            "System.Reason",
            "System.AreaPath",
            "System.IterationPath",
            "System.Tags",
            "System.Description",
            "Microsoft.VSTS.TCM.ReproSteps",
            "Microsoft.VSTS.Common.AcceptanceCriteria",
            "Microsoft.VSTS.Common.Priority",
            "Microsoft.VSTS.Common.Severity",
            "Microsoft.VSTS.Common.ValueArea",
            "Microsoft.VSTS.Common.BusinessValue",
            "Microsoft.VSTS.Common.StackRank",
            "Microsoft.VSTS.Common.Activity",
            "Microsoft.VSTS.CMMI.Blocked",
            "Microsoft.VSTS.Scheduling.StoryPoints",
            "Microsoft.VSTS.Scheduling.OriginalEstimate",
            "Microsoft.VSTS.Scheduling.RemainingWork",
            "Microsoft.VSTS.Scheduling.CompletedWork",
            "Microsoft.VSTS.Common.ResolvedDate",
            "Microsoft.VSTS.Common.ResolvedBy",
            "Microsoft.VSTS.Common.Resolution",
            "Microsoft.VSTS.Common.ClosedDate",
            "Custom.AssignedTeam",
            "Custom.Source",
            "Custom.Stakeholders",
            "Custom.Externallink",
            "Custom.DevelopmentPartner",
            "System.Rev",
            "Custom.DoRStatus",
            "Custom.DoRDecision",
            "Custom.DoRApprovedBy",
            "Custom.DoRApprovedDate",
            "Custom.DoRRevision"
        };

        private static string[] GetFieldsForProfile(WorkItemFieldProfile profile) =>
            profile switch
            {
                WorkItemFieldProfile.Base => WorkItemBaseFields,
                WorkItemFieldProfile.Full => WorkItemFullFields,
                _ => WorkItemBaseFields
            };

        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };

        private string _project => _connectionProvider.Project;

        public string Project => _project;

        private readonly string _absoluteBaseUrl;
        private readonly string _organization;
        private readonly string _organizationBaseUrl;

        public AzureDevOpsBoardsClient(
            IAzureDevOpsRestClient rest,
            IAzureDevOpsConnectionProvider connectionProvider,
            IOptions<AzureSettings> azureSettings,
            ILogger<AzureDevOpsBoardsClient> logger)
        {
            _rest = rest ?? throw new ArgumentNullException(nameof(rest));
            _connectionProvider = connectionProvider ?? throw new ArgumentNullException(nameof(connectionProvider));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            // Work item relation links (e.g. Hierarchy-Reverse when creating a Task) require a full
            // absolute URL, unlike every other AzureUrlHelper.BaseUrl consumer that relies on the
            // HttpClient's own BaseAddress to fill in the scheme+host.
            _absoluteBaseUrl = $"{azureSettings.Value.BaseUrl.TrimEnd('/')}/{azureSettings.Value.Organization}/{azureSettings.Value.Project}/";
            // Org-level, no project - lets CreateCrossProjectHelpTextTaskAsync address a second
            // project (Dokumentation) without touching the AzureUrlHelper.BaseUrl singleton, which
            // is fixed to this client's own project for the lifetime of the process.
            _organization = azureSettings.Value.Organization;
            _organizationBaseUrl = $"{azureSettings.Value.BaseUrl.TrimEnd('/')}/{azureSettings.Value.Organization}/";
        }

        #region Iterationer

        public async Task<IReadOnlyList<Sprint>> GetIterationsAsync(
            DeveloperTeam team,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetSprintsUrl(team);
            var json = await _rest.GetStringAsync(url, ct);

            var response = JsonSerializer.Deserialize<IterationsResponse>(json, JsonOptions);
            return AzureDevopsMapper.ToSprintList(response?.Iterations ?? []);
        }

        public async Task<Sprint?> GetCurrentIterationAsync(
            DeveloperTeam team,
            CancellationToken ct = default)
        {
            var iterations = await GetIterationsAsync(team, ct);
            return iterations.FirstOrDefault(i => i.IsCurrent);
        }

        #endregion

        #region Area paths

        public async Task<IReadOnlyList<string>> GetTeamAreaPathsAsync(
            DeveloperTeam team,
            CancellationToken ct = default)
        {
            var meta = team.GetMetadata();

            var workClient = _connectionProvider.GetWorkClient();
            var witClient = _connectionProvider.GetWorkItemTrackingClient();

            var teamContext = new TeamContext(_project, meta.AzureDevOpsName);
            var tfv = await workClient.GetTeamFieldValuesAsync(teamContext, ct);

            var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var v in tfv.Values ?? Enumerable.Empty<TeamFieldValue>())
            {
                var raw = v.Value?.Trim();           // path relativt projektet (ingen projektprefix)
                if (string.IsNullOrWhiteSpace(raw))
                    continue;

                // Om "IncludeChildren" är satt vill vi returnera alla underliggande paths
                if (v.IncludeChildren)
                {
                    // Hantera fallet att teamet pekar på projektroten (t.ex. "MyProject")
                    if (IsProjectQualified(raw))
                        raw = StripProject(raw, _project);

                    Microsoft.TeamFoundation.WorkItemTracking.WebApi.Models.WorkItemClassificationNode node;

                    if (IsRoot(raw))
                    {
                        node = await witClient.GetClassificationNodeAsync(
                            _project, Microsoft.TeamFoundation.WorkItemTracking.WebApi.Models.TreeStructureGroup.Areas, depth: 50, cancellationToken: ct);
                    }
                    else
                    {
                        node = await witClient.GetClassificationNodeAsync(
                            _project, Microsoft.TeamFoundation.WorkItemTracking.WebApi.Models.TreeStructureGroup.Areas, path: raw, depth: 50, cancellationToken: ct);
                    }

                    foreach (var p in FlattenAreaPaths(node, basePath: raw))
                        paths.Add(EnsureProjectQualified(p)); // kvalificera först i returvärdet
                }
                else
                {
                    // Endast den exakta area-pathen
                    v.Value = EnsureProjectQualified(v.Value);
                    if (!string.IsNullOrWhiteSpace(v.Value))
                        paths.Add(v.Value);
                }
            }

            return paths.OrderBy(p => p).ToList();

            static bool IsProjectQualified(string s) => s.Contains('\\');
            static bool IsRoot(string s) => string.IsNullOrEmpty(s) || s == "\\" || s == ".";
            static string StripProject(string s, string project) => s.StartsWith(project + "\\", StringComparison.OrdinalIgnoreCase) ? s[(project.Length + 1)..] : s;
            string EnsureProjectQualified(string path)
            {
                if (string.IsNullOrWhiteSpace(path)) return path;
                var p = path.Trim();

                if (p.StartsWith(_project + "\\", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(p, _project, StringComparison.OrdinalIgnoreCase))
                    return p;

                return $"{_project}\\{p}";
            }

            static IEnumerable<string> FlattenAreaPaths(Microsoft.TeamFoundation.WorkItemTracking.WebApi.Models.WorkItemClassificationNode node, string basePath)
            {
                if (string.IsNullOrEmpty(basePath) || node == null)
                    yield break;

                yield return basePath;

                if (node.Children == null) yield break;

                foreach (var child in node.Children)
                {
                    var childPath = $"{basePath}\\{child.Name}";
                    foreach (var p in FlattenAreaPaths(child, childPath))
                        yield return p;
                }
            }
        }

        #endregion

        private async Task<List<WorkItemWithFields>> GetWorkItemsInternalAsync(
            IReadOnlyList<int> ids,
            WorkItemFieldProfile profile,
            bool expandRelations,
            CancellationToken ct,
            // Board/list views fetch dozens of items across several batches, where one batch
            // failing shouldn't take the whole view down - so those swallow and log. A single
            // explicit lookup by id has no such "the rest still matters" case: swallowing there
            // silently turned a fetch failure into "not found" (a wrong PATCH's field name, a
            // timeout, whatever) - a 404 with no explanation, from a card that demonstrably exists.
            bool throwOnFailure = false)
        {
            var all = new List<WorkItemWithFields>();

            if (ids == null || ids.Count == 0)
                return all;

            var fields = GetFieldsForProfile(profile);
            var url = AzureUrlHelper.GetWorkItemsDetailsPostUrl();

            foreach (var batch in Batch(ids.ToList(), BatchSize))
            {
                var payload = new WorkItemBatchRequest
                {
                    Ids = batch.ToArray(),
                    Fields = expandRelations ? null : fields,
                    Expand = expandRelations ? "relations" : null
                };

                try
                {
                    var result =
                        await _rest.PostJsonAsync<WorkItemBatchRequest, WorkItemBatchResponse>(url, payload, ct)
                                   .ConfigureAwait(false);

                    if (result?.Value != null)
                        all.AddRange(result.Value);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Failed to fetch work item details for batch {Ids}",
                        string.Join(",", batch));
                    if (throwOnFailure) throw;
                }
            }

            return all;
        }

        private async Task<WorkItemWithFields?> GetWorkItemInternalAsync(
            int id,
            WorkItemFieldProfile profile,
            bool expandRelations,
            CancellationToken ct)
        {
            var items = await GetWorkItemsInternalAsync(new[] { id }, profile, expandRelations, ct, throwOnFailure: true)
                .ConfigureAwait(false);

            return items.SingleOrDefault();
        }

        #region Work Items

        public async Task<IReadOnlyList<WorkItemDto>> GetIterationWorkItemsAsync(
            string iterationPath,
            IEnumerable<string> areaPaths,
            IEnumerable<WorkItemType> workItemTypes = null,
            CancellationToken ct = default)
        {
            var areaClause = WiqlHelper.BuildAreaPathWhereClause(areaPaths);

            var whereParts = new List<string>
            {
                $"[System.TeamProject] = '{WiqlHelper.Escape(_project)}'",
                $"[System.IterationPath] = '{WiqlHelper.Escape(iterationPath)}'"
            };

            if (workItemTypes != null && workItemTypes.Any())
            {
                var mappedTypes = workItemTypes
                    .Select(x => x.ToAzureDevOpsString())
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(x => $"'{WiqlHelper.Escape(x)}'")
                    .ToList();

                if (mappedTypes.Count > 0)
                    whereParts.Add($"[System.WorkItemType] IN ({string.Join(", ", mappedTypes)})");
            }

            if (!string.IsNullOrWhiteSpace(areaClause))
                whereParts.Add(areaClause);

            var selectFields = GetFieldsForProfile(WorkItemFieldProfile.Full);

            var wiqlObject = new
            {
                query = $@"
            SELECT
                [System.Id]
            FROM WorkItems
            WHERE
                {string.Join("\n                AND ", whereParts)}
            ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.Id] ASC"
            };

            var ids = await RunWiqlIdsAsync(wiqlObject.query, ct)
                .ConfigureAwait(false);

            if (ids.Count == 0)
                return Array.Empty<WorkItemDto>();

            var items = await GetWorkItemsInternalAsync(
                    ids,
                    WorkItemFieldProfile.Full,
                    expandRelations: true,
                    ct)
                .ConfigureAwait(false);

            var dtos = items.Select(w => w.ToDto()).ToList();

            // Hitta parentIds som ev. saknas i resultatet pga att de ligger i en annan Iteration
            // Behövs för att kunna visa parent-titel i Task-rader
            var existingIds = dtos.Select(d => d.Id).ToHashSet();
            var missingParentIds = dtos
                .Where(d => d.TypeEnum == WorkItemType.Task && d.ParentId.HasValue)
                .Select(d => d.ParentId!.Value)
                .Where(pid => !existingIds.Contains(pid))
                .Distinct()
                .ToList();

            if (missingParentIds.Count > 0)
            {
                var parentItems = await GetWorkItemsInternalAsync(
                        missingParentIds,
                        WorkItemFieldProfile.Full,
                        expandRelations: true,
                        ct)
                    .ConfigureAwait(false);

                dtos.AddRange(parentItems.Select(w => w.ToDto()));
            }

            return dtos;
        }

        public async Task<IReadOnlyList<int>> RunWiqlIdsAsync(
            string wiql,
            CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(wiql))
                return Array.Empty<int>();

            var wiqlUrl = AzureUrlHelper.GetWiqlUrl();
            var wiqlObject = new { query = wiql };
            var wiqlResult = await _rest
                .PostJsonAsync<object, WiqlWorkItemResponse>(wiqlUrl, wiqlObject, ct)
                .ConfigureAwait(false);

            return wiqlResult?.workItemReferences?
                       .Select(wi => wi.Id)
                       .ToList()
                   ?? new List<int>();
        }

        public async Task<WorkItemWithFields> GetWorkItemDetailsAsync(
            int workItemId,
            CancellationToken ct = default)
        {
            var workItem = await GetWorkItemInternalAsync(
                    workItemId,
                    WorkItemFieldProfile.Full,
                    expandRelations: true,
                    ct)
                .ConfigureAwait(false);

            if (workItem == null)
            {
                _logger.LogWarning("Work item {WorkItemId} was not found or could not be loaded.", workItemId);
                return new WorkItemWithFields();
            }

            return workItem;
        }

        public async Task<IReadOnlyList<WorkItemDto>> GetWorkItemsDetailsAsync(
            IReadOnlyList<int> workItemIds,
            CancellationToken ct = default)
        {
            if (workItemIds == null || workItemIds.Count == 0)
                return Array.Empty<WorkItemDto>();

            var items = await GetWorkItemsInternalAsync(
                    workItemIds,
                    WorkItemFieldProfile.Base,
                    expandRelations: true,
                    ct)
                .ConfigureAwait(false);

            return items.Select(w => w.ToDto()).ToList();
        }

        private static IEnumerable<List<T>> Batch<T>(List<T> source, int batchSize)
        {
            for (var i = 0; i < source.Count; i += batchSize)
                yield return source.GetRange(i, Math.Min(batchSize, source.Count - i));
        }

        #endregion

        #region Refinement / Product Backlog

        // Sorted first, in this order; anything else the board defines follows in Azure's own row
        // order, and the board's unnamed default row (mapped to "Standard") always comes last.
        private static readonly string[] KnownRowPriority = { "Måste", "Bör", "Önskvärt", "Extra" };

        private static int RowPriority(string rowName)
        {
            if (string.IsNullOrWhiteSpace(rowName)) return int.MaxValue; // the default/"Standard" row
            var index = Array.FindIndex(KnownRowPriority, n => string.Equals(n, rowName, StringComparison.OrdinalIgnoreCase));
            return index < 0 ? KnownRowPriority.Length : index;
        }

        public async Task<IReadOnlyList<AzureTeamDto>> GetProjectTeamsAsync(CancellationToken ct = default)
        {
            var response = await _rest.GetJsonAsync<AzureTeamsResponse>(AzureUrlHelper.GetProjectTeamsUrl(), ct)
                .ConfigureAwait(false);
            return (response?.Value ?? new List<AzureTeam>())
                .Select(t => new AzureTeamDto { Id = t.Id, Name = t.Name })
                .OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        public async Task<ProductBacklogDto> GetProductBacklogAsync(
            string boardTeam,
            string? tag,
            string? iterationPath,
            string? areaPath,
            CancellationToken ct = default)
        {
            const string boardName = "Features";

            var boardsResponse = await _rest.GetJsonAsync<AzureBoardsResponse>(AzureUrlHelper.GetTeamBoardsUrl(boardTeam), ct)
                .ConfigureAwait(false);
            var boardRef = (boardsResponse?.Value ?? new List<AzureBoardReference>())
                .FirstOrDefault(b => string.Equals(b.Name, boardName, StringComparison.OrdinalIgnoreCase));
            if (boardRef is null)
                throw new InvalidOperationException($"Teamet \"{boardTeam}\" saknar en \"{boardName}\"-backlognivå.");

            var board = await _rest.GetJsonAsync<AzureBoardDetail>(AzureUrlHelper.GetTeamBoardUrl(boardTeam, boardRef.Id), ct)
                .ConfigureAwait(false);
            if (board is null)
                throw new InvalidOperationException($"Kunde inte läsa boarden \"{boardName}\" för \"{boardTeam}\".");

            var rows = board.Rows
                .Select((row, index) => new { row, index })
                .OrderBy(r => RowPriority(r.row.Name))
                .ThenBy(r => r.index)
                .Select((r, order) => new ProductBacklogRowDto
                {
                    Name = string.IsNullOrWhiteSpace(r.row.Name) ? "Standard" : r.row.Name,
                    Color = r.row.Color,
                    Order = order,
                })
                .ToList();
            if (rows.Count == 0 || rows.All(r => r.Name != "Standard"))
                rows.Add(new ProductBacklogRowDto { Name = "Standard", Order = rows.Count });

            var columns = board.Columns
                .Select((column, index) =>
                {
                    var name = string.IsNullOrWhiteSpace(column.Name) ? "Övrigt" : column.Name;
                    var kind = string.Equals(name, "Icebox", StringComparison.OrdinalIgnoreCase) ? "icebox"
                        : string.Equals(name, "Closed", StringComparison.OrdinalIgnoreCase) ? "closed"
                        : "lane";
                    return new ProductBacklogColumnDto { Name = name, Kind = kind, Order = index };
                })
                .ToList();

            var boardDto = new ProductBacklogBoardDto
            {
                Id = boardRef.Id,
                Name = board.Name ?? boardName,
                Team = boardTeam,
                Rows = rows,
                Columns = columns,
            };

            var whereParts = new List<string>
            {
                $"[System.TeamProject] = '{WiqlHelper.Escape(_project)}'",
                "[System.WorkItemType] = 'Feature'",
                "[System.State] <> 'Removed'",
            };
            if (!string.IsNullOrWhiteSpace(iterationPath))
                whereParts.Add($"[System.IterationPath] = '{WiqlHelper.Escape(iterationPath)}'");
            if (!string.IsNullOrWhiteSpace(areaPath))
                whereParts.Add($"([System.AreaPath] = '{WiqlHelper.Escape(areaPath)}' OR [System.AreaPath] UNDER '{WiqlHelper.Escape(areaPath)}')");

            var wiql = "SELECT [System.Id] FROM WorkItems WHERE " + string.Join(" AND ", whereParts) +
                       " ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.Id] ASC";
            var orderedFeatureIds = await RunWiqlIdsAsync(wiql, ct).ConfigureAwait(false);
            if (orderedFeatureIds.Count == 0)
                return new ProductBacklogDto { Board = boardDto, FeatureIds = new List<int>(), Items = new List<ProductBacklogItemDto>() };

            var featureRaw = await GetWorkItemsInternalAsync(orderedFeatureIds, WorkItemFieldProfile.Full, expandRelations: true, ct)
                .ConfigureAwait(false);
            var featureItems = featureRaw.Select(w => w.ToDto()).ToList();

            var requestedTag = tag?.Trim();
            if (!string.IsNullOrWhiteSpace(requestedTag))
                featureItems = featureItems
                    .Where(f => f.Tags.Any(t => string.Equals(t, requestedTag, StringComparison.OrdinalIgnoreCase)))
                    .ToList();
            var featureIdSet = featureItems.Select(f => f.Id).ToHashSet();
            var filteredFeatureIds = orderedFeatureIds.Where(featureIdSet.Contains).ToList();

            // The board's actual column/lane field - a per-team, per-backlog-level custom field on
            // most orgs (Azure generates a name like "WEF_<hash>_Kanban.Column"), not the fixed
            // System.BoardColumn/System.BoardLane those two only cover for the Requirements board.
            var columnFieldRef = board.Fields?.ColumnField?.ReferenceName;
            var rowFieldRef = board.Fields?.RowField?.ReferenceName;
            var boardPositionByFeatureId = featureRaw.ToDictionary(
                w => w.Id,
                w => (
                    Lane: ResolveBoardFieldValue(w.Fields, rowFieldRef, w.Fields?.BoardLane),
                    Column: ResolveBoardFieldValue(w.Fields, columnFieldRef, w.Fields?.BoardColumn)));

            var byId = await ExpandParentChainAsync(featureItems, ct).ConfigureAwait(false);
            byId = await ExpandChildrenAsync(byId, featureItems.Select(f => f.Id), ct).ConfigureAwait(false);

            // "rows" always contains a "Standard" entry by this point - either a real unnamed row
            // that got the name, or the synthetic one added above when the board had none.
            const string defaultLaneName = "Standard";
            var items = byId.Values
                .Where(d => !string.Equals(d.Type, "Task", StringComparison.OrdinalIgnoreCase))
                .Select(d => ToBacklogItem(d, isFeature: featureIdSet.Contains(d.Id), defaultLaneName, byId, boardPositionByFeatureId))
                .ToList();

            return new ProductBacklogDto { Board = boardDto, FeatureIds = filteredFeatureIds, Items = items };
        }

        /// <summary>
        /// The board's column/lane field, resolved from whatever reference name the board's own
        /// config names (falling back to the typed System.BoardColumn/System.BoardLane properties
        /// when that happens to be it, or when the board didn't say). Anything else comes back out
        /// of WorkItemFields.ExtensionData, since it isn't a field this app otherwise reads.
        /// </summary>
        private static string ResolveBoardFieldValue(WorkItemFields fields, string referenceName, string typedFallback)
        {
            if (fields is null) return null;
            if (string.IsNullOrWhiteSpace(referenceName) ||
                string.Equals(referenceName, "System.BoardColumn", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(referenceName, "System.BoardLane", StringComparison.OrdinalIgnoreCase))
                return typedFallback;

            if (fields.ExtensionData != null &&
                fields.ExtensionData.TryGetValue(referenceName, out var element) &&
                element.ValueKind == JsonValueKind.String)
                return element.GetString();

            return null;
        }

        public async Task<ProductBacklogDto> GetRefinementSprintAsync(
            string iterationPath,
            IEnumerable<string> areaPaths,
            CancellationToken ct = default)
        {
            // Features are almost never themselves scheduled into a sprint iteration - only their
            // User Stories/Bugs are - so the seed query excludes Feature and ExpandParentChainAsync
            // pulls each one's Feature (and Epic) parent in afterwards regardless of iteration.
            var seed = await GetIterationWorkItemsAsync(
                    iterationPath,
                    areaPaths,
                    new[] { WorkItemType.UserStory, WorkItemType.Bug },
                    ct)
                .ConfigureAwait(false);

            var byId = await ExpandParentChainAsync(seed, ct).ConfigureAwait(false);
            var items = byId.Values
                .Where(d => !string.Equals(d.Type, "Task", StringComparison.OrdinalIgnoreCase))
                .Select(d => ToBacklogItem(d, isFeature: false, defaultLaneName: null, byId, boardPositions: null))
                .ToList();

            return new ProductBacklogDto
            {
                Board = null,
                FeatureIds = byId.Values.Where(d => string.Equals(d.Type, "Feature", StringComparison.OrdinalIgnoreCase)).Select(d => d.Id).ToList(),
                Items = items,
            };
        }

        public async Task<ProductBacklogDto> GetTaggedRefinementItemsAsync(
            string iterationPathPrefix,
            IEnumerable<string> areaPaths,
            string tag,
            CancellationToken ct = default)
        {
            var areaClause = WiqlHelper.BuildAreaPathWhereClause(areaPaths);

            var whereParts = new List<string>
            {
                $"[System.TeamProject] = '{WiqlHelper.Escape(_project)}'",
                "[System.State] <> 'Removed'",
                $"[System.IterationPath] UNDER '{WiqlHelper.Escape(iterationPathPrefix)}'",
                $"[System.Tags] CONTAINS '{WiqlHelper.Escape(tag)}'",
            };
            if (!string.IsNullOrWhiteSpace(areaClause))
                whereParts.Add(areaClause);

            var wiql = "SELECT [System.Id] FROM WorkItems WHERE " + string.Join(" AND ", whereParts) +
                       " ORDER BY [System.WorkItemType] ASC, [System.Id] ASC";
            var ids = await RunWiqlIdsAsync(wiql, ct).ConfigureAwait(false);
            if (ids.Count == 0)
                return new ProductBacklogDto { Board = null, FeatureIds = new List<int>(), Items = new List<ProductBacklogItemDto>() };

            var seed = (await GetWorkItemsInternalAsync(ids, WorkItemFieldProfile.Full, expandRelations: true, ct)
                    .ConfigureAwait(false))
                .Select(w => w.ToDto())
                .Where(d => !string.Equals(d.Type, "Task", StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Pulls each match's Epic/Feature ancestors in for context (the same EpicChain every
            // other source shows above a card) - a tagged match can itself be any type, unlike the
            // sprint source's seed which is always User Story/Bug.
            var byId = await ExpandParentChainAsync(seed, ct).ConfigureAwait(false);
            var items = byId.Values
                .Where(d => !string.Equals(d.Type, "Task", StringComparison.OrdinalIgnoreCase))
                .Select(d => ToBacklogItem(d, isFeature: false, defaultLaneName: null, byId, boardPositions: null))
                .ToList();

            return new ProductBacklogDto
            {
                Board = null,
                FeatureIds = byId.Values.Where(d => string.Equals(d.Type, "Feature", StringComparison.OrdinalIgnoreCase)).Select(d => d.Id).ToList(),
                Items = items,
            };
        }

        public async Task<ProductBacklogDto> SearchRefinementItemsAsync(
            string query,
            CancellationToken ct = default)
        {
            var term = query?.Trim() ?? "";
            if (term.Length < 2)
                return new ProductBacklogDto { Board = null, FeatureIds = new List<int>(), Items = new List<ProductBacklogItemDto>() };

            var ids = int.TryParse(term, out var idValue)
                ? await RunWiqlIdsAsync($"SELECT [System.Id] FROM WorkItems WHERE [System.Id] = {idValue}", ct).ConfigureAwait(false)
                : await RunWiqlIdsAsync(
                        "SELECT [System.Id] FROM WorkItems WHERE [System.Title] CONTAINS '" + WiqlHelper.Escape(term) + "' " +
                        "AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC",
                        ct)
                    .ConfigureAwait(false);

            if (ids.Count == 0)
                return new ProductBacklogDto { Board = null, FeatureIds = new List<int>(), Items = new List<ProductBacklogItemDto>() };

            // No location scoping at all - "regardless of where it lives" is the whole point of
            // this source - and no parent-chain expansion either, unlike the other sources: a
            // search hit's ancestors are rarely also in the (unrelated) hit list, so there'd be
            // nothing for an EpicChain to show anyway.
            var capped = ids.Take(50).ToList();
            var dtos = (await GetWorkItemsInternalAsync(capped, WorkItemFieldProfile.Full, expandRelations: true, ct)
                    .ConfigureAwait(false))
                .Select(w => w.ToDto())
                .Where(d => !string.Equals(d.Type, "Task", StringComparison.OrdinalIgnoreCase))
                .ToList();
            var byId = dtos.ToDictionary(d => d.Id);

            var items = dtos
                .Select(d => ToBacklogItem(d, isFeature: false, defaultLaneName: null, byId, boardPositions: null))
                .ToList();

            return new ProductBacklogDto { Board = null, FeatureIds = new List<int>(), Items = items };
        }

        private static ProductBacklogItemDto ToBacklogItem(
            WorkItemDto d,
            bool isFeature,
            string? defaultLaneName,
            Dictionary<int, WorkItemDto> byId,
            Dictionary<int, (string? Lane, string? Column)>? boardPositions)
        {
            string? lane = null;
            string? column = null;
            if (isFeature)
            {
                var resolved = boardPositions != null && boardPositions.TryGetValue(d.Id, out var pos) ? pos : (Lane: d.BoardLane, Column: d.BoardColumn);
                lane = string.IsNullOrWhiteSpace(resolved.Lane) ? defaultLaneName : resolved.Lane;
                column = resolved.Column;
            }

            return new ProductBacklogItemDto
            {
                Id = d.Id,
                Type = d.Type,
                Title = d.Title,
                State = d.State,
                AssignedTo = d.AssignedTo,
                CreatedBy = d.CreatedBy,
                StoryPoints = d.StoryPoints,
                Tags = d.Tags,
                ParentId = d.ParentId,
                // Excludes Task ids implicitly - Tasks are never fetched into byId.
                ChildIds = d.ChildIds.Where(byId.ContainsKey).ToList(),
                BoardLane = lane,
                BoardColumn = column,
                StackRank = isFeature ? d.StackRank : null,
            };
        }

        /// <summary>Walks each item's ParentId upward (Feature -> Epic -> Epic -> ...), fetching
        /// whatever isn't already in hand. Capped at 5 levels so a data error can't loop forever.</summary>
        private async Task<Dictionary<int, WorkItemDto>> ExpandParentChainAsync(
            IEnumerable<WorkItemDto> seed,
            CancellationToken ct)
        {
            var byId = seed.ToDictionary(d => d.Id);
            var toFetch = new Queue<int>(
                byId.Values
                    .Where(d => d.ParentId.HasValue && !byId.ContainsKey(d.ParentId.Value))
                    .Select(d => d.ParentId!.Value)
                    .Distinct());

            for (var level = 0; level < 5 && toFetch.Count > 0; level++)
            {
                var batch = toFetch.Distinct().Where(id => !byId.ContainsKey(id)).ToList();
                toFetch.Clear();
                if (batch.Count == 0) break;

                var parents = (await GetWorkItemsInternalAsync(batch, WorkItemFieldProfile.Full, expandRelations: true, ct)
                        .ConfigureAwait(false))
                    .Select(w => w.ToDto());
                foreach (var p in parents)
                {
                    if (byId.TryAdd(p.Id, p) && p.ParentId.HasValue && !byId.ContainsKey(p.ParentId.Value))
                        toFetch.Enqueue(p.ParentId.Value);
                }
            }

            return byId;
        }

        /// <summary>Fetches one level of children (User Stories/Bugs) for the given parent ids,
        /// excluding Tasks - the Refinement board never shows task-level detail.</summary>
        private async Task<Dictionary<int, WorkItemDto>> ExpandChildrenAsync(
            Dictionary<int, WorkItemDto> byId,
            IEnumerable<int> parentIds,
            CancellationToken ct)
        {
            var childIds = parentIds
                .SelectMany(pid => byId.TryGetValue(pid, out var p) ? p.ChildIds : Enumerable.Empty<int>())
                .Distinct()
                .Where(id => !byId.ContainsKey(id))
                .ToList();
            if (childIds.Count == 0)
                return byId;

            var children = (await GetWorkItemsInternalAsync(childIds, WorkItemFieldProfile.Full, expandRelations: true, ct)
                    .ConfigureAwait(false))
                .Select(w => w.ToDto())
                .Where(c => !string.Equals(c.Type, "Task", StringComparison.OrdinalIgnoreCase));
            foreach (var c in children)
                byId.TryAdd(c.Id, c);

            return byId;
        }

        #endregion

        #region Revisioner & updates

        public async Task<IReadOnlyList<WorkItemRevision>> GetRevisionsAsync(
            int workItemId,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetWorkItemRevisionsUrl(workItemId);

            try
            {
                var json = await _rest.GetStringAsync(url, ct);
                var wrapper = JsonSerializer.Deserialize<WorkItemRevisionsResponse>(json, JsonOptions);
                return wrapper?.Value ?? new List<WorkItemRevision>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Misslyckades med att hämta revisioner för work item {WorkItemId}",
                    workItemId);
                throw;
            }
        }

        public async Task<WorkItemUpdatesRoot> GetWorkItemUpdatesAsync(
            int workItemId,
            CancellationToken ct = default)
        {
            var queryParams = new List<string>(); // skip/top vid behov
            var url = AzureUrlHelper.GetWorkItemUpdatesUrl(workItemId, queryParams);
            var json = await _rest.GetStringAsync(url, ct);
            var updates = JsonSerializer.Deserialize<WorkItemUpdatesRoot>(json, JsonOptions);
            return updates ?? new WorkItemUpdatesRoot();
        }

        public async Task UpdateWorkItemFieldsAsync(
            int workItemId,
            IReadOnlyDictionary<string, object?> fields,
            CancellationToken ct = default)
        {
            if (fields == null || fields.Count == 0)
                return;

            // Two Azure quirks decide which JSON-Patch op we emit:
            //
            // 1. Clearing a field needs "remove" (no value property at all), not "add". "add" with
            //    null is rejected outright ("Value cannot be null"), and "add" with "" is worse:
            //    Azure answers 200 but silently keeps the old value. So null and "" both mean clear.
            //
            // 2. "add" on System.Tags *merges* with the existing tags instead of replacing them, so
            //    writing back the remaining tags to drop one is a silent no-op. "replace" overwrites
            //    properly and works even when the work item has no tags yet, so tags always use it.
            var patch = fields
                .Where(field => !string.IsNullOrWhiteSpace(field.Key))
                .Select(field => field.Value is null or ""
                    ? (object)new { op = "remove", path = "/fields/" + field.Key }
                    : new
                    {
                        op = field.Key == "System.Tags" ? "replace" : "add",
                        path = "/fields/" + field.Key,
                        value = field.Value
                    })
                .ToList();

            if (patch.Count == 0)
                return;

            await _rest.PatchJsonPatchAsync(AzureUrlHelper.GetWorkItemPatchUrl(workItemId), patch, ct);
        }

        public async Task<int> CreateTaskAsync(
            int parentId,
            string title,
            string? activity,
            string? assignedTo,
            string? state,
            string? areaPath,
            string? iterationPath,
            CancellationToken ct = default)
        {
            var patch = new List<WorkItemPatchOperation>
            {
                new("add", "/fields/System.Title", title)
            };

            if (!string.IsNullOrWhiteSpace(activity))
                patch.Add(new WorkItemPatchOperation("add", "/fields/Microsoft.VSTS.Common.Activity", activity));
            if (!string.IsNullOrWhiteSpace(assignedTo))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.AssignedTo", assignedTo));
            if (!string.IsNullOrWhiteSpace(state))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.State", state));
            if (!string.IsNullOrWhiteSpace(areaPath))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.AreaPath", areaPath));
            if (!string.IsNullOrWhiteSpace(iterationPath))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.IterationPath", iterationPath));

            patch.Add(new WorkItemPatchOperation("add", "/relations/-", new
            {
                rel = "System.LinkTypes.Hierarchy-Reverse",
                url = $"{_absoluteBaseUrl}_apis/wit/workitems/{parentId}"
            }));

            var response = await _rest.PostJsonPatchAsync(AzureUrlHelper.GetCreateWorkItemUrl("Task"), patch, ct);
            using var document = JsonDocument.Parse(response.Body);
            return document.RootElement.GetProperty("id").GetInt32();
        }

        public async Task<int> CreateRelatedUserStoryAsync(
            int relatedToId,
            string title,
            string? assignedTo,
            string? areaPath,
            string? iterationPath,
            CancellationToken ct = default)
        {
            var patch = new List<WorkItemPatchOperation>
            {
                new("add", "/fields/System.Title", title)
            };

            if (!string.IsNullOrWhiteSpace(assignedTo))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.AssignedTo", assignedTo));
            if (!string.IsNullOrWhiteSpace(areaPath))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.AreaPath", areaPath));
            if (!string.IsNullOrWhiteSpace(iterationPath))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.IterationPath", iterationPath));

            // Related, not Hierarchy-Reverse - this is a sibling card, not a child of the story it
            // splits the hjälptext work out of.
            patch.Add(new WorkItemPatchOperation("add", "/relations/-", new
            {
                rel = "System.LinkTypes.Related",
                url = $"{_absoluteBaseUrl}_apis/wit/workitems/{relatedToId}"
            }));

            var response = await _rest.PostJsonPatchAsync(AzureUrlHelper.GetCreateWorkItemUrl("User Story"), patch, ct);
            using var document = JsonDocument.Parse(response.Body);
            return document.RootElement.GetProperty("id").GetInt32();
        }

        /// <summary>
        /// Creates a Task in a different project (<paramref name="targetProject"/>), parented under
        /// <paramref name="parentStoryId"/> there, with a Related link back to
        /// <paramref name="relatedWorkItemId"/> in *this* client's own project. Read/update/query
        /// calls work across projects in the same Azure DevOps org regardless of which project's URL
        /// they're addressed through - only creation is genuinely project-scoped (it decides the new
        /// item's area path, iteration and process template), which is why this is the one operation
        /// that needs its own explicit project rather than reusing <see cref="_absoluteBaseUrl"/>.
        /// </summary>
        public async Task<int> CreateCrossProjectHelpTextTaskAsync(
            string targetProject,
            int parentStoryId,
            string title,
            string? descriptionHtml,
            string? assignedTo,
            int relatedWorkItemId,
            CancellationToken ct = default)
        {
            var projectSegment = Uri.EscapeDataString(targetProject);
            var targetAbsoluteBaseUrl = $"{_organizationBaseUrl}{projectSegment}/";

            var patch = new List<WorkItemPatchOperation>
            {
                new("add", "/fields/System.Title", title),
                new("add", "/fields/Microsoft.VSTS.Common.Activity", "Documentation"),
            };
            if (!string.IsNullOrWhiteSpace(descriptionHtml))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.Description", descriptionHtml));
            if (!string.IsNullOrWhiteSpace(assignedTo))
                patch.Add(new WorkItemPatchOperation("add", "/fields/System.AssignedTo", assignedTo));

            // Parent: the fixed bucket story (BESTÄLLNING) that already lives in the target project.
            patch.Add(new WorkItemPatchOperation("add", "/relations/-", new
            {
                rel = "System.LinkTypes.Hierarchy-Reverse",
                url = $"{targetAbsoluteBaseUrl}_apis/wit/workitems/{parentStoryId}"
            }));
            // Related, not Child - the card this text belongs to stays in its own project, and this
            // link is the only write that touches it (Azure mirrors it onto that card automatically,
            // so it never needs a separate PATCH here).
            patch.Add(new WorkItemPatchOperation("add", "/relations/-", new
            {
                rel = "System.LinkTypes.Related",
                url = $"{_absoluteBaseUrl}_apis/wit/workitems/{relatedWorkItemId}"
            }));

            var createUrl = $"{_organization}/{projectSegment}/_apis/wit/workitems/$Task?api-version=7.1";
            var response = await _rest.PostJsonPatchAsync(createUrl, patch, ct);
            using var document = JsonDocument.Parse(response.Body);
            return document.RootElement.GetProperty("id").GetInt32();
        }

        /// <summary>
        /// Creates a work item of any type, optionally linked to another one. `linkRel` is the
        /// Azure link type: "System.LinkTypes.Hierarchy-Reverse" makes the new item a child of
        /// `linkToId`, "System.LinkTypes.Related" makes it a sibling.
        /// </summary>
        public async Task<int> CreateWorkItemAsync(
            string workItemType,
            IReadOnlyDictionary<string, object?> fields,
            int? linkToId,
            string? linkRel,
            CancellationToken ct = default)
        {
            var patch = fields
                .Where(field => !string.IsNullOrWhiteSpace(field.Key) && field.Value is not null && field.Value is not "")
                .Select(field => new WorkItemPatchOperation("add", "/fields/" + field.Key, field.Value))
                .ToList();

            if (patch.Count == 0)
                throw new ArgumentException("A new work item needs at least one field.", nameof(fields));

            if (linkToId.HasValue && !string.IsNullOrWhiteSpace(linkRel))
            {
                patch.Add(new WorkItemPatchOperation("add", "/relations/-", new
                {
                    rel = linkRel,
                    url = $"{_absoluteBaseUrl}_apis/wit/workitems/{linkToId.Value}"
                }));
            }

            var response = await _rest.PostJsonPatchAsync(AzureUrlHelper.GetCreateWorkItemUrl(workItemType), patch, ct);
            using var document = JsonDocument.Parse(response.Body);
            return document.RootElement.GetProperty("id").GetInt32();
        }

        public async Task AddWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default)
        {
            var patch = new List<WorkItemPatchOperation>
            {
                new("add", "/relations/-", new
                {
                    rel = linkRel,
                    url = $"{_absoluteBaseUrl}_apis/wit/workitems/{targetId}"
                })
            };
            await _rest.PatchJsonPatchAsync(AzureUrlHelper.GetWorkItemPatchUrl(workItemId), patch, ct);
        }

        /// <summary>
        /// Removes the link between two work items. JSON-Patch can only remove a relation by its
        /// position in the array, so the current relations are read first to find it - and the
        /// array holds PR and commit artifact links too, which is why the index can't be guessed.
        /// </summary>
        public async Task RemoveWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default)
        {
            var raw = await GetWorkItemDetailsAsync(workItemId, ct);
            var relations = raw?.Relations ?? new List<Entities.WorkItemRelation>();

            var index = relations.FindIndex(r =>
                string.Equals(r.Rel, linkRel, StringComparison.OrdinalIgnoreCase) &&
                Offline.AzureWorkItemRelationParser.TryParseIdFromUrl(r.Url) == targetId);

            if (index < 0)
                return; // already gone - nothing to do, and nothing worth failing over

            var patch = new List<WorkItemPatchOperation>
            {
                new("remove", $"/relations/{index}", null)
            };
            await _rest.PatchJsonPatchAsync(AzureUrlHelper.GetWorkItemPatchUrl(workItemId), patch, ct);
        }

        /// <summary>
        /// Deletes a work item. Azure puts it in the project's recycle bin rather than destroying
        /// it, so an accidental delete from the DoR checklist can be undone from Azure DevOps.
        /// </summary>
        public async Task DeleteWorkItemAsync(int workItemId, CancellationToken ct = default)
        {
            await _rest.DeleteAsync(AzureUrlHelper.GetDeleteWorkItemUrl(workItemId), ifMatchVersion: null, ct: ct);
        }

        public async Task AddWorkItemCommentAsync(int workItemId, string text, CancellationToken ct = default)
        {
            await _rest.PostJsonAsync(AzureUrlHelper.GetWorkItemCommentsUrl(workItemId), new { text }, ct);
        }

        /// <summary>Every area (or iteration) path in the project, project-qualified and sorted.</summary>
        public async Task<IReadOnlyList<string>> GetClassificationPathsAsync(bool areas, CancellationToken ct = default)
        {
            var json = await _rest.GetStringAsync(AzureUrlHelper.GetClassificationNodesUrl(areas ? "areas" : "iterations"), ct);
            using var document = JsonDocument.Parse(json);
            var paths = new List<string>();
            // The root node is the project itself, so its own name starts every path and the
            // recursion just appends child names below it.
            Walk(document.RootElement, null);
            return paths.OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToList();

            void Walk(JsonElement node, string? parentPath)
            {
                if (!node.TryGetProperty("name", out var nameElement)) return;
                var name = nameElement.GetString();
                if (string.IsNullOrWhiteSpace(name)) return;

                var path = parentPath is null ? name : $"{parentPath}\\{name}";
                paths.Add(path);

                if (!node.TryGetProperty("children", out var children) || children.ValueKind != JsonValueKind.Array) return;
                foreach (var child in children.EnumerateArray())
                    Walk(child, path);
            }
        }

        /// <summary>
        /// The same iteration tree, but with the dates Azure keeps on each node - which is what
        /// tells a sprint apart from the folder above it, and today's sprint apart from next one's.
        ///
        /// Read from the project's classification nodes rather than the team-settings endpoint on
        /// purpose: that one needs a team with exactly the expected name to exist, and a sandbox
        /// project has none. Nodes without dates are folders (or an unscheduled sprint) and come
        /// back with nulls rather than being dropped - the caller decides what to do with them.
        /// </summary>
        public async Task<IReadOnlyList<IterationNodeDto>> GetIterationNodesAsync(CancellationToken ct = default)
        {
            var json = await _rest.GetStringAsync(AzureUrlHelper.GetClassificationNodesUrl("iterations"), ct);
            using var document = JsonDocument.Parse(json);
            var nodes = new List<IterationNodeDto>();
            Walk(document.RootElement, null);
            return nodes;

            void Walk(JsonElement node, string? parentPath)
            {
                if (!node.TryGetProperty("name", out var nameElement)) return;
                var name = nameElement.GetString();
                if (string.IsNullOrWhiteSpace(name)) return;

                var path = parentPath is null ? name : $"{parentPath}\\{name}";
                var hasChildren = node.TryGetProperty("children", out var children)
                                  && children.ValueKind == JsonValueKind.Array
                                  && children.GetArrayLength() > 0;
                nodes.Add(new IterationNodeDto(path, name, DateOf(node, "startDate"), DateOf(node, "finishDate"), hasChildren));

                if (!hasChildren) return;
                foreach (var child in children.EnumerateArray())
                    Walk(child, path);
            }

            static DateTime? DateOf(JsonElement node, string attribute)
            {
                if (!node.TryGetProperty("attributes", out var attributes) || attributes.ValueKind != JsonValueKind.Object)
                    return null;
                if (!attributes.TryGetProperty(attribute, out var value) || value.ValueKind != JsonValueKind.String)
                    return null;
                return value.TryGetDateTime(out var parsed) ? parsed : null;
            }
        }

        /// <summary>
        /// The picklists one work item type actually offers, keyed by field reference name. Read
        /// from the process template rather than hardcoded: the values are not what a reasonable
        /// guess would produce (Severity is "2 - High (&lt; 16 h )", Source is "Internal" not
        /// "Internt"), and a wrong value makes Azure reject the whole save with a 400.
        /// </summary>
        public async Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetWorkItemTypeFieldOptionsAsync(
            string workItemType,
            CancellationToken ct = default)
        {
            var json = await _rest.GetStringAsync(AzureUrlHelper.GetWorkItemTypeFieldsUrl(workItemType), ct);
            using var document = JsonDocument.Parse(json);
            var result = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase);

            if (!document.RootElement.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.Array)
                return result;

            foreach (var field in value.EnumerateArray())
            {
                if (!field.TryGetProperty("referenceName", out var nameElement)) continue;
                var name = nameElement.GetString();
                if (string.IsNullOrWhiteSpace(name)) continue;
                if (!field.TryGetProperty("allowedValues", out var allowed) || allowed.ValueKind != JsonValueKind.Array) continue;

                var values = allowed
                    .EnumerateArray()
                    .Select(v => v.GetString())
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Select(v => v!)
                    .ToList();
                if (values.Count > 0)
                    result[name] = values;
            }

            return result;
        }

        public async Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct = default)
        {
            var json = await _rest.GetStringAsync(AzureUrlHelper.GetTagsUrl(), ct);
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.Array)
                return Array.Empty<string>();

            return value
                .EnumerateArray()
                .Select(t => t.TryGetProperty("name", out var n) ? n.GetString() : null)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n!)
                .OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }

        public async Task<IReadOnlyList<Entities.WorkItemCommentEntity>> GetWorkItemCommentsAsync(
            int workItemId,
            CancellationToken ct = default)
        {
            try
            {
                var json = await _rest.GetStringAsync(AzureUrlHelper.GetWorkItemCommentsUrl(workItemId), ct);
                var response = JsonSerializer.Deserialize<Entities.WorkItemCommentsResponse>(json, JsonOptions);
                return response?.Comments ?? new List<Entities.WorkItemCommentEntity>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch comments for work item {WorkItemId}", workItemId);
                return Array.Empty<Entities.WorkItemCommentEntity>();
            }
        }

        public async Task<(byte[] Bytes, string ContentType)> GetAttachmentAsync(
            Guid attachmentId,
            string? fileName,
            CancellationToken ct = default)
            => await _rest.GetBytesAsync(AzureUrlHelper.GetWorkItemAttachmentUrl(attachmentId, fileName), ct);

        public async Task<Entities.AttachmentReference> UploadAttachmentAsync(
            byte[] bytes,
            string fileName,
            string contentType,
            CancellationToken ct = default)
        {
            // Azure DevOps' attachment upload API only accepts a literal application/octet-stream
            // Content-Type on this endpoint - the real MIME type (e.g. image/png) is rejected with
            // a 400. The actual file type is conveyed by fileName/extension instead.
            var json = await _rest.PostBinaryAsync(AzureUrlHelper.GetWorkItemAttachmentUploadUrl(fileName), bytes, "application/octet-stream", ct);
            return JsonSerializer.Deserialize<Entities.AttachmentReference>(json, JsonOptions) ?? new Entities.AttachmentReference();
        }

        #endregion

        private sealed record WorkItemPatchOperation(string Op, string Path, object? Value);
    }
}
