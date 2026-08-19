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
            "System.CreatedDate",
            "System.ChangedDate",
            "System.AreaPath",
            "System.IterationPath",
            "System.Tags",
            "Microsoft.VSTS.Scheduling.StoryPoints",
            "Microsoft.VSTS.Common.Activity",
            "Microsoft.VSTS.CMMI.Blocked",
            "Custom.AssignedTeam",
            "Custom.Source",
            "Custom.Stakeholders",
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
            "Custom.DevelopmentPartner"
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
            CancellationToken ct)
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
            var items = await GetWorkItemsInternalAsync(new[] { id }, profile, expandRelations, ct)
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

            // A null value clears a field (e.g. an Identity field like Development Partner) - Azure
            // rejects "add" with a null value ("Value cannot be null"), it needs a "remove" op with
            // no value property at all instead.
            var patch = fields
                .Where(field => !string.IsNullOrWhiteSpace(field.Key))
                .Select(field => field.Value is null
                    ? (object)new { op = "remove", path = "/fields/" + field.Key }
                    : new { op = "add", path = "/fields/" + field.Key, value = field.Value })
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
