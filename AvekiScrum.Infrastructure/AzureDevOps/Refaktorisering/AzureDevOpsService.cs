using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Helpers;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Application.Services;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps.Offline;
using AvekiScrum.Shared.Enums;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public sealed class AzureDevOpsService : IAzureDevOpsService
    {
        private readonly IAzureDevOpsGitClient _git;
        private readonly IAzureDevOpsBoardsClient _boards;
        private readonly IAzureDevOpsWikiClient _wiki;
        private readonly IAzureDevOpsTeamClient _team;
        private readonly IAzureDevOpsTestPlansClient _testPlans;
        private readonly IImageContentService _images;
        private readonly ILogger<AzureDevOpsService> _logger;
        private readonly IMediator _mediator;
        private readonly IConfiguration _configuration;
        private readonly AzureSettings _settings;

        public AzureDevOpsService(
            IAzureDevOpsGitClient git,
            IAzureDevOpsBoardsClient boards,
            IAzureDevOpsWikiClient wiki,
            IAzureDevOpsTeamClient team,
            IAzureDevOpsTestPlansClient testPlans,
            IImageContentService images,
            IMediator mediator,
            ILogger<AzureDevOpsService> logger,
            IConfiguration configuration,
            IOptions<AzureSettings> settings)
        {
            _git = git;
            _boards = boards;
            _wiki = wiki;
            _team = team;
            _testPlans = testPlans;
            _images = images;
            _mediator = mediator;
            _logger = logger;
            _configuration = configuration;
            _settings = settings.Value;
        }

        // -------------------- TEAM --------------------

        public Task<List<TeamMemberDto>> GetTeamMembersAsync(DeveloperTeam team)
            => _team.GetTeamMembersAsync(team);

        public Task<IReadOnlyList<AzureDevopsTeamInfo>> ListTeamsAsync(CancellationToken ct = default)
            => _team.ListTeamsAsync(ct);

        // -------------------- ITERATIONER (Boards) --------------------

        public Task<IReadOnlyList<Sprint>> GetIterationsAsync(DeveloperTeam team, CancellationToken ct = default)
            => _boards.GetIterationsAsync(team, ct);

        public Task<Sprint?> GetCurrentIterationAsync(DeveloperTeam team, CancellationToken ct = default)
            => _boards.GetCurrentIterationAsync(team, ct);

        public Task<IReadOnlyList<string>> GetTeamAreaPathsAsync(DeveloperTeam team, CancellationToken ct = default)
            => _boards.GetTeamAreaPathsAsync(team, ct);

        public Task<IReadOnlyList<WorkItemDto>> GetIterationWorkItemsAsync(
            string iterationPath,
            IEnumerable<string> areaPaths,
            IEnumerable<WorkItemType> workItemTypes = null,
            CancellationToken ct = default)
            => _boards.GetIterationWorkItemsAsync(iterationPath, areaPaths, workItemTypes, ct);

        //private Task<WorkItemDto?> GetWorkItemDetailsAsync(int workItemId, CancellationToken ct = default)
        //    => _boards.GetWorkItemDetailsAsync(workItemId, ct);

        public Task<IReadOnlyList<WorkItemDto>> GetWorkItemsDetailsAsync(
            IReadOnlyList<int> workItemIds, CancellationToken ct = default)
            => _boards.GetWorkItemsDetailsAsync(workItemIds, ct);

        public Task<WorkItemUpdatesRoot> GetWorkItemUpdatesAsync(int workItemId, CancellationToken ct = default)
            => _boards.GetWorkItemUpdatesAsync(workItemId, ct);

        public Task<IReadOnlyList<int>> RunWiqlIdsAsync(string wiql, CancellationToken ct = default)
            => _boards.RunWiqlIdsAsync(wiql, ct);

        public Task UpdateWorkItemFieldsAsync(int workItemId, IReadOnlyDictionary<string, object?> fields, CancellationToken ct = default)
            => _boards.UpdateWorkItemFieldsAsync(workItemId, fields, ct);

        public Task<int> CreateTaskAsync(int parentId, string title, string? activity, string? assignedTo, string? state, string? areaPath, string? iterationPath, CancellationToken ct = default)
            => _boards.CreateTaskAsync(parentId, title, activity, assignedTo, state, areaPath, iterationPath, ct);

        public Task<int> CreateRelatedUserStoryAsync(int relatedToId, string title, string? assignedTo, string? areaPath, string? iterationPath, CancellationToken ct = default)
            => _boards.CreateRelatedUserStoryAsync(relatedToId, title, assignedTo, areaPath, iterationPath, ct);

        public Task<int> CreateWorkItemAsync(string workItemType, IReadOnlyDictionary<string, object?> fields, int? linkToId, string? linkRel, CancellationToken ct = default)
            => _boards.CreateWorkItemAsync(workItemType, fields, linkToId, linkRel, ct);

        public Task AddWorkItemCommentAsync(int workItemId, string text, CancellationToken ct = default)
            => _boards.AddWorkItemCommentAsync(workItemId, text, ct);

        public Task DeleteWorkItemAsync(int workItemId, CancellationToken ct = default)
            => _boards.DeleteWorkItemAsync(workItemId, ct);

        public Task AddWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default)
            => _boards.AddWorkItemRelationAsync(workItemId, targetId, linkRel, ct);

        public Task RemoveWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default)
            => _boards.RemoveWorkItemRelationAsync(workItemId, targetId, linkRel, ct);

        public Task<IReadOnlyList<string>> GetClassificationPathsAsync(bool areas, CancellationToken ct = default)
            => _boards.GetClassificationPathsAsync(areas, ct);

        public Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct = default)
            => _boards.GetTagsAsync(ct);

        public Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetWorkItemTypeFieldOptionsAsync(string workItemType, CancellationToken ct = default)
            => _boards.GetWorkItemTypeFieldOptionsAsync(workItemType, ct);

        //public Task<IReadOnlyList<WorkItemRevision>> GetRevisionsAsync(int workItemId, CancellationToken ct = default)
        //    => _boards.GetRevisionsAsync(workItemId, ct);


        public async Task<List<DeveloperStoryPoints>> GetCompletedStoryPointsAsync(
            DeveloperTeam team,
            string iterationPath,
            DateTime sprintStart,
            DateTime sprintEnd,
            CancellationToken ct)
        {
            var areaPaths = await _boards.GetTeamAreaPathsAsync(team, ct);
            var storiesAndBugs = new[]
            {
                WorkItemType.UserStory,
                WorkItemType.Bug
            };
            var items = await _boards.GetIterationWorkItemsAsync(iterationPath, areaPaths, storiesAndBugs, ct);

            var byDev = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);

            foreach (var wi in items)
            {
                if (!IsCompleted(wi, sprintEnd)) continue;

                var dev = wi.AssignedTo ?? "Unassigned";
                if (!byDev.TryGetValue(dev, out var sum)) sum = 0;

                var sp = wi.StoryPoints.GetValueOrDefault(0);
                if (sp > 0) byDev[dev] = sum + sp;
            }

            return byDev.Select(kv => new DeveloperStoryPoints
            {
                AssignedTo = kv.Key,
                TotalStoryPoints = kv.Value
            }).ToList();
        }

        public async Task<IReadOnlyList<WorkItemDto>> GetAllWorkItemsWithDetailsAsync(
            string iterationPath,
            DeveloperTeam team,
            CancellationToken ct)
        {
            var areaPaths = await _boards.GetTeamAreaPathsAsync(team, ct);
            var storiesAndBugs = new[]
            {
                WorkItemType.UserStory,
                WorkItemType.Bug
            };
            var items = await _boards.GetIterationWorkItemsAsync(iterationPath, areaPaths, storiesAndBugs, ct);

            var ids = items.Select(i => i.Id).ToList();
            if (ids.Count == 0) return Array.Empty<WorkItemDto>();

            var withDetails = await _boards.GetWorkItemsDetailsAsync(ids, ct);

            // GetIterationWorkItemsAsync's type filter excludes Task-type items, so ChildIds is
            // populated on each story/bug but the actual Task work items themselves are missing
            // from this list. SprintBacklogMapper.MapToStories() builds each story's Tasks purely
            // by filtering Task-type entries out of this same list - without fetching them here,
            // every story would show zero tasks regardless of what's really on the board.
            var idSet = ids.ToHashSet();
            var childTaskIds = withDetails
                .SelectMany(w => w.ChildIds)
                .Distinct()
                .Where(id => !idSet.Contains(id))
                .ToList();

            if (childTaskIds.Count == 0)
                return withDetails;

            var childTasks = await _boards.GetWorkItemsDetailsAsync(childTaskIds, ct);
            return withDetails
                .Concat(childTasks.Where(t => t.TypeEnum == WorkItemType.Task))
                .ToList();
        }

        // -------------------- STORY POINTS (domännära beräkning) --------------------

        public async Task<IterationStoryPointsResult> GetIterationStoryPointsAsync(
            DeveloperTeam team,
            string iterationPath,
            DateTime sprintStart,
            DateTime sprintEnd,
            CancellationToken ct = default)
        {
            var areaPaths = await _boards.GetTeamAreaPathsAsync(team, ct);
            var storiesAndBugs = new[]
            {
                WorkItemType.UserStory,
                WorkItemType.Bug
            };
            var items = await _boards.GetIterationWorkItemsAsync(iterationPath, areaPaths, storiesAndBugs, ct);

            var result = new IterationStoryPointsResult
            {
                SprintBacklog = items.ToList()
            };

            foreach (var wi in items)
            {
                var assignedTo = wi.AssignedTo ?? "Unassigned";
                var sp = wi.StoryPoints;

                if (sp > 0)
                {
                    result.Planned.Add(new WorkItemStoryPoints
                    {
                        WorkItemId = wi.Id,
                        AssignedTo = assignedTo,
                        TotalStoryPoints = sp
                    });
                }

                if (IsCompleted(wi, sprintEnd))
                {
                    result.Completed.Add(new WorkItemStoryPoints
                    {
                        WorkItemId = wi.Id,
                        AssignedTo = assignedTo,
                        TotalStoryPoints = sp
                    });
                }
            }

            return result;
        }

        //public async Task<List<DeveloperStoryPoints>> GetStoryPointsAtIterationStartAsync(
        //    DeveloperTeam team,
        //    string iterationPath,
        //    DateTime startDate,
        //    CancellationToken ct = default)
        //{
        //    var devs = await _mediator.Send(new Application.UseCases.Scrum.TeamMembers.GetTeamMembersQuery(
        //        team, [TeamRoleType.Developers]), ct);

        //    var developerNames = devs.Select(m => m.DisplayName)
        //                             .ToHashSet(StringComparer.OrdinalIgnoreCase);

        //    var areaPaths = await _boards.GetTeamAreaPathsAsync(team, ct);
        //    var items = await _boards.GetIterationWorkItemsAsync(iterationPath, areaPaths, ct);
        //    var ids = items.Select(i => i.Id).ToList();

        //    if (!ids.Any())
        //        return developerNames.Select(n => new DeveloperStoryPoints { AssignedTo = n, TotalStoryPoints = 0 }).ToList();

        //    const int MaxConcurrency = 5;
        //    var semaphore = new SemaphoreSlim(MaxConcurrency);
        //    var tasks = ids.Select(id => Task.Run(async () =>
        //    {
        //        await semaphore.WaitAsync(ct);
        //        try { return await _boards.GetRevisionsAsync(id, ct); }
        //        finally { semaphore.Release(); }
        //    }, ct)).ToList();

        //    await Task.WhenAll(tasks);

        //    var spByDev = developerNames.ToDictionary(n => n, _ => 0.0, StringComparer.OrdinalIgnoreCase);

        //    foreach (var t in tasks)
        //    {
        //        var rev = t.Result
        //            .Where(r =>
        //                r.Fields.TryGetValue("System.ChangedDate", out var cdObj) &&
        //                DateTime.Parse(cdObj.ToString()) <= startDate)
        //            .OrderByDescending(r => r.Rev)
        //            .FirstOrDefault();

        //        if (rev == null) continue;

        //        var assignedTo = TryGetString(rev.Fields, "System.AssignedTo") ?? "Unassigned";
        //        if (!spByDev.ContainsKey(assignedTo)) continue;

        //        var sp = TryGetDouble(rev.Fields, "Microsoft.VSTS.Scheduling.StoryPoints");
        //        spByDev[assignedTo] += sp;
        //    }

        //    return spByDev.Select(kv => new DeveloperStoryPoints
        //    {
        //        AssignedTo = kv.Key,
        //        TotalStoryPoints = kv.Value
        //    }).ToList();

        //    static string? TryGetString(Dictionary<string, object> fields, string key)
        //    {
        //        if (!fields.TryGetValue(key, out var v) || v is null) return null;
        //        return v switch
        //        {
        //            Microsoft.VisualStudio.Services.WebApi.IdentityRef id => id.DisplayName,
        //            _ => v.ToString()
        //        };
        //    }

        //    static double TryGetDouble(Dictionary<string, object> fields, string key)
        //    {
        //        if (!fields.TryGetValue(key, out var v) || v is null) return 0;
        //        return v switch
        //        {
        //            double d => d,
        //            float f => f,
        //            int i => i,
        //            long l => l,
        //            string s when double.TryParse(s, out var d) => d,
        //            _ => 0
        //        };
        //    }
        //}

        private static bool IsCompleted(WorkItemDto wi, DateTime sprintEnd)
        {
            if (wi.State.Equals("Closed", StringComparison.OrdinalIgnoreCase) ||
                wi.State.Equals("Done", StringComparison.OrdinalIgnoreCase))
            {
                var completedDate = wi.ClosedDate ?? wi.ResolvedDate ?? wi.ChangedDate;
                return completedDate?.Date <= sprintEnd.Date;
            }
            return false;
        }

        // -------------------- GIT / PR --------------------

        public Task<IReadOnlyList<RepoInfo>> ListRepositoriesAsync(CancellationToken ct = default)
            => _git.ListRepositoriesAsync(ct);

        public Task<IReadOnlyList<PullRequestInfo>> ListActivePullRequestsAsync(string repoId, CancellationToken ct = default)
            => _git.ListActivePullRequestsAsync(repoId, ct);

        public Task<IReadOnlyList<PullRequestDto>> GetCompletedPullRequestsAsync(
            PullRequestOptions options, CancellationToken ct = default)
            => _git.GetCompletedPullRequestsAsync(options, ct);

        public Task<IReadOnlyList<PrThread>> GetPullRequestThreadsAsync(string repositoryIdOrName, int pullRequestId, CancellationToken ct = default)
            => _git.GetPullRequestThreadsAsync(repositoryIdOrName, pullRequestId, ct);

        public Task<PullRequestDetails> GetPullRequestDetailsAsync(string repoId, int pullRequestId, CancellationToken ct = default)
            => _git.GetPullRequestDetailsAsync(repoId, pullRequestId, ct);

        public Task<IReadOnlyList<ChangedFile>> GetPullRequestChangedFilesAsync(string repoId, int prId, CancellationToken ct = default)
            => _git.GetPullRequestChangedFilesAsync(repoId, prId, ct);

        public Task<string> GetFileContentAtCommitAsync(string repoId, string filePath, string commitId, CancellationToken ct = default)
            => _git.GetFileContentAtCommitAsync(repoId, filePath, commitId, ct);

        public Task<IReadOnlyList<RepoTestScanResult>> ScanReposForTestProjectsAsync(CancellationToken ct = default)
            => _git.ScanReposForTestProjectsAsync(ct);

        public Task<IReadOnlyList<PullRequestDto>> GetCompletedPullRequestsAsync(PullRequestOptions options)
            => _git.GetCompletedPullRequestsAsync(options);

        public Task<IReadOnlyList<PrThread>> GetPullRequestThreadsAsync(string repositoryIdOrName, int pullRequestId)
            => _git.GetPullRequestThreadsAsync(repositoryIdOrName, pullRequestId);

        // -------------------- WIKI --------------------

        public Task<IReadOnlyList<WikiInfoDto>> ListWikisAsync(CancellationToken ct = default)
            => _wiki.ListWikisAsync(ct);

        public Task<WikiPageDto?> GetWikiPageAsync(string wikiIdOrName, string path, bool includeContent = true, int? version = null, CancellationToken ct = default)
            => _wiki.GetPageAsync(wikiIdOrName, path, includeContent, version, ct);

        public Task<WikiUpsertResultDto> UpsertWikiPageAsync(string wikiIdOrName, string path, string content, string? comment = null, string? expectedETag = null, CancellationToken ct = default)
            => _wiki.UpsertPageAsync(wikiIdOrName, path, content, comment, expectedETag, ct);

        public Task<bool> DeleteWikiPageAsync(string wikiIdOrName, string path, string? expectedETag = null, CancellationToken ct = default)
            => _wiki.DeletePageAsync(wikiIdOrName, path, expectedETag, ct);

        public Task<IReadOnlyList<WikiSearchResult>> SearchWikiAsync(string wikiIdOrName, string searchText, CancellationToken ct = default)
            => _wiki.SearchPagesAsync(wikiIdOrName, searchText, ct);

        public Task<WikiPageDto> GetWikiRootPageAsync(string wikiId)
            => _wiki.GetWikiRootPageAsync(wikiId);

        //Images
        public Task<byte[]> GetImageBytesAsync(string url)
            => _images.GetImageBytesAsync(url);

        public Task<System.Drawing.Image> LoadImageFromUrlAsync(string url)
            => _images.LoadImageFromUrlAsync(url);

        // -------------------- TEST --------------------
        public async Task<TestingTaskMetricsSummary> GetTestWorkItemMetrics(
            IEnumerable<string> areaPaths,
            DateTimeOffset from,
            DateTimeOffset to,
            CancellationToken ct)
        {
            // Bygg en WIQL som hämtar "test-relaterade" typer
            // (Lägg till/ta bort typer vid behov)
            var areaClause = WiqlHelper.BuildAreaPathWhereClause(areaPaths);
            var where = new List<string>
            {
                $"[System.TeamProject] = '{WiqlHelper.Escape(_boards.Project)}'",
                "([System.WorkItemType] IN ('Test Case','Bug','Task'))",
                $"[System.ChangedDate] >= '{from.UtcDateTime:O}'",
                $"[System.ChangedDate] <= '{to.UtcDateTime:O}'"
            };
            if (!string.IsNullOrWhiteSpace(areaClause)) where.Add(areaClause);

            var wiql = $@"
                SELECT
                    [System.Id],
                    [System.State],
                    [System.AssignedTo],
                    [System.WorkItemType],
                    [System.CreatedDate],
                    [Microsoft.VSTS.Common.ClosedDate]
                FROM WorkItems
                WHERE {string.Join(" AND ", where)}
                ORDER BY [System.ChangedDate] DESC";

            // Utnyttja Boards-klienten för att köra WIQL och hämta detaljer:
            // (vi återanvänder batch-detaljerna som i dina andra metoder)
            var ids = await _boards.RunWiqlIdsAsync(wiql, ct);
            if (ids.Count == 0) return TestingTaskMetricsSummary.Empty;

            var details = await _boards.GetWorkItemsDetailsAsync(ids, ct);

            var dto = new TestingTaskMetricsSummary();

            foreach (var wi in details)
            {
                dto.TotalTasks++;

                if (!string.IsNullOrWhiteSpace(wi.State))
                    dto.TasksByState[wi.State] = dto.TasksByState.TryGetValue(wi.State, out var s) ? s + 1 : 1;

                var who = wi.AssignedTo ?? "Unassigned";
                dto.TasksByAssignedTo[who] = dto.TasksByAssignedTo.TryGetValue(who, out var c) ? c + 1 : 1;

                if (wi.CreatedDate >= from.UtcDateTime &&
                    wi.CreatedDate <= to.UtcDateTime)
                    dto.TasksCreatedInWindow++;

                if (wi.ClosedDate.HasValue &&
                    wi.ClosedDate.Value >= from.UtcDateTime &&
                    wi.ClosedDate.Value <= to.UtcDateTime)
                    dto.TasksClosedInWindow++;

                var wid = await _boards.GetWorkItemDetailsAsync(wi.Id);
                var wir = await GetWorkItemUpdatesAsync(wi.Id);
                dto.DetailedMetrics.Add(MetricsCalculator.ComputeTestingTaskMetrics(wid.ToDto(), wir.Value));
            }

            return dto;
        }

        public async Task<WorkItemDetailDto?> GetWorkItemDetailAsync(int workItemId, CancellationToken ct = default)
        {
            var raw = await _boards.GetWorkItemDetailsAsync(workItemId, ct);
            if (raw?.Fields == null)
                return null;

            var relations = raw.Relations ?? new List<Entities.WorkItemRelation>();
            var parentId = AzureWorkItemRelationParser.TryGetParentId(relations);
            var childIds = AzureWorkItemRelationParser.GetChildIds(relations);
            var relatedIds = relations
                .Where(r => string.Equals(r.Rel, "System.LinkTypes.Related", StringComparison.OrdinalIgnoreCase))
                .Select(r => AzureWorkItemRelationParser.TryParseIdFromUrl(r.Url))
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToList();

            var allRelatedIds = new List<int>(childIds);
            if (parentId.HasValue) allRelatedIds.Add(parentId.Value);
            allRelatedIds.AddRange(relatedIds);
            allRelatedIds = allRelatedIds.Distinct().ToList();

            var summaries = allRelatedIds.Count > 0
                ? await _boards.GetWorkItemsDetailsAsync(allRelatedIds, ct)
                : Array.Empty<WorkItemDto>();
            var summaryById = summaries.ToDictionary(s => s.Id);

            static WorkItemRelationRefDto ToRef(WorkItemDto s) => new()
            {
                Id = s.Id,
                Type = s.Type,
                Title = s.Title,
                State = s.State,
                Activity = s.Activity
            };

            var comments = await _boards.GetWorkItemCommentsAsync(workItemId, ct);

            // Developers branch off a task as often as off the story, so a story whose own relations
            // hold no PR can still have every one of its tasks in review. Its child tasks' PRs are
            // therefore folded in alongside its own (the summaries above were already fetched with
            // relations expanded, so this costs no extra round trip), tagged with the task they came
            // from. The card's own PRs come first and win on duplicates, so a PR linked to both the
            // story and a task keeps reading as the story's.
            var childTaskPullRequests = childIds
                .Select(id => summaryById.TryGetValue(id, out var child) ? child : null)
                .Where(child => child != null)
                .SelectMany(child => child!.PullRequests.Select(pr => (Pr: pr, Task: child)))
                .ToList();

            var rawPullRequests = AzureWorkItemRelationParser.GetPullRequests(relations)
                .Select(pr => (Pr: pr, Task: (WorkItemDto?)null))
                .Concat(childTaskPullRequests)
                .GroupBy(x => (x.Pr.RepoId, x.Pr.PullRequestId))
                .Select(g => g.First())
                .ToList();

            foreach (var (pr, _) in rawPullRequests.Where(x => string.IsNullOrWhiteSpace(x.Pr.WebUrl)))
                pr.WebUrl = $"https://dev.azure.com/{AzureUrlHelper.BaseUrl}_git/{pr.RepoId}/pullrequest/{pr.PullRequestId}";

            // The relation itself only carries a generic "Pull Request" label, not the real title -
            // enrich each one from the Git API (title, reviewers with vote, comment counts). A work
            // item normally has very few PRs, so the extra per-PR calls are cheap here - this is not
            // done for the Dailys board's own PR cards, where it would mean one call per PR across
            // the whole sprint.
            var pullRequests = new List<WorkItemPullRequestDto>();
            foreach (var (pr, sourceTask) in rawPullRequests)
            {
                var repoId = pr.RepoId.ToString();
                WorkItemPullRequestDto enriched;
                try
                {
                    var details = await _git.GetPullRequestDetailsAsync(repoId, pr.PullRequestId, ct);
                    var threads = await _git.GetPullRequestThreadsAsync(repoId, pr.PullRequestId, ct);
                    var discussionThreads = threads
                        .Where(t => (t.Comments ?? new List<PrComment>())
                            .Any(c => !string.Equals(c.CommentType, "system", StringComparison.OrdinalIgnoreCase)))
                        .ToList();
                    var resolvedThreads = discussionThreads
                        .Count(t => !string.IsNullOrWhiteSpace(t.Status) &&
                                    !string.Equals(t.Status, "active", StringComparison.OrdinalIgnoreCase) &&
                                    !string.Equals(t.Status, "pending", StringComparison.OrdinalIgnoreCase));

                    enriched = new WorkItemPullRequestDto
                    {
                        PullRequestId = pr.PullRequestId,
                        RepoId = repoId,
                        Title = string.IsNullOrWhiteSpace(details.Title) ? pr.Title : details.Title,
                        Status = string.IsNullOrWhiteSpace(details.Status) ? pr.Status : details.Status,
                        TargetBranch = details.TargetBranch,
                        WebUrl = pr.WebUrl,
                        CreatedDate = details.CreationDate ?? pr.CreatedDate,
                        CreatedBy = string.IsNullOrWhiteSpace(details.CreatedBy) ? null : details.CreatedBy,
                        Reviewers = (details.ReviewerVotes ?? Array.Empty<PrReviewerVote>())
                            .Select(r => new PrReviewerDto { DisplayName = r.DisplayName, Vote = r.Vote, IsRequired = r.IsRequired })
                            .ToList(),
                        CommentsTotal = discussionThreads.Count,
                        CommentsResolved = resolvedThreads
                    };
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not enrich PR {PullRequestId} in repo {RepoId} - falling back to relation data.", pr.PullRequestId, repoId);
                    enriched = new WorkItemPullRequestDto
                    {
                        PullRequestId = pr.PullRequestId,
                        RepoId = repoId,
                        Title = pr.Title,
                        Status = pr.Status,
                        WebUrl = pr.WebUrl,
                        CreatedDate = pr.CreatedDate,
                        CreatedBy = pr.CreatedBy
                    };
                }
                enriched.SourceTaskId = sourceTask?.Id;
                enriched.SourceTaskTitle = sourceTask?.Title;
                pullRequests.Add(enriched);
            }

            var updates = await _boards.GetWorkItemUpdatesAsync(workItemId, ct);
            var history = new List<WorkItemHistoryEntryDto>();
            foreach (var update in updates.Value)
            {
                if (update.Fields?.State != null)
                    history.Add(new WorkItemHistoryEntryDto
                    {
                        When = update.RevisedDate,
                        Field = "Status",
                        OldValue = update.Fields.State.OldValue,
                        NewValue = update.Fields.State.NewValue
                    });
                if (update.Fields?.AssignedTo != null)
                    history.Add(new WorkItemHistoryEntryDto
                    {
                        When = update.RevisedDate,
                        Field = "Tilldelad",
                        OldValue = update.Fields.AssignedTo.OldValue?.DisplayName,
                        NewValue = update.Fields.AssignedTo.NewValue?.DisplayName
                    });
                if (update.Fields?.Tags != null)
                    history.Add(new WorkItemHistoryEntryDto
                    {
                        When = update.RevisedDate,
                        Field = "Taggar",
                        OldValue = update.Fields.Tags.OldValue,
                        NewValue = update.Fields.Tags.NewValue
                    });
            }
            history = history.OrderByDescending(h => h.When).ToList();

            var fields = raw.Fields;
            return new WorkItemDetailDto
            {
                Id = raw.Id,
                Type = fields.WorkItemType,
                Title = fields.Title,
                State = fields.State,
                Reason = fields.Reason,
                AssignedTo = fields.AssignedTo?.DisplayName,
                DevelopmentPartner = fields.DevelopmentPartner?.DisplayName,
                CreatedBy = fields.CreatedBy?.DisplayName,
                AreaPath = fields.AreaPath,
                IterationPath = fields.IterationPath,
                StoryPoints = fields.StoryPoints,
                Priority = fields.Priority,
                Severity = fields.Severity,
                Source = fields.Source,
                ValueArea = fields.ValueArea,
                BusinessValue = fields.BusinessValue,
                Activity = fields.Activity,
                OriginalEstimate = fields.OriginalEstimate,
                RemainingWork = fields.RemainingWork,
                CompletedWork = fields.CompletedWork,
                AssignedTeam = fields.AssignedTeam,
                Stakeholders = fields.Stakeholders,
                Tags = string.IsNullOrWhiteSpace(fields.Tags)
                    ? new List<string>()
                    : fields.Tags.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
                // Bug work items store their content in ReproSteps, not Description - Azure keeps
                // System.Description blank for Bugs and the real text lives in a different field.
                DescriptionHtml = string.Equals(fields.WorkItemType, "Bug", StringComparison.OrdinalIgnoreCase)
                    ? fields.ReproSteps ?? ""
                    : fields.Description ?? "",
                AcceptanceCriteriaHtml = fields.AcceptanceCriteria ?? "",
                WebUrl = $"https://dev.azure.com/{AzureUrlHelper.BaseUrl}_workitems/edit/{raw.Id}",
                CreatedDate = fields.CreatedDate,
                ChangedDate = fields.ChangedDate,
                Parent = parentId.HasValue && summaryById.TryGetValue(parentId.Value, out var parentSummary)
                    ? ToRef(parentSummary)
                    : null,
                Children = childIds
                    .Where(summaryById.ContainsKey)
                    .Select(id => ToRef(summaryById[id]))
                    .ToList(),
                Related = relatedIds
                    .Where(summaryById.ContainsKey)
                    .Select(id => ToRef(summaryById[id]))
                    .ToList(),
                Comments = comments.Select(c => new WorkItemCommentDto
                {
                    Author = c.CreatedBy?.DisplayName,
                    TextHtml = c.Text ?? "",
                    CreatedDate = c.CreatedDate
                }).ToList(),
                PullRequests = pullRequests,
                History = history
            };
        }

        public Task<(byte[] Bytes, string ContentType)> GetWorkItemAttachmentAsync(
            Guid attachmentId, string? fileName, CancellationToken ct = default)
            => _boards.GetAttachmentAsync(attachmentId, fileName, ct);

        public async Task<(Guid Id, string ProxyUrl)> UploadWorkItemAttachmentAsync(
            byte[] bytes, string fileName, string contentType, CancellationToken ct = default)
        {
            var reference = await _boards.UploadAttachmentAsync(bytes, fileName, contentType, ct);
            return (reference.Id, $"/api/attachments/{reference.Id:D}?fileName={Uri.EscapeDataString(fileName)}");
        }

        public async Task<IReadOnlyList<PlanningSprintGoal>> GetSprintGoalsAsync(DeveloperTeam team, CancellationToken ct = default)
        {
            var wikiUrl = _configuration[$"PlanningBoard:SprintGoalsWikiUrls:{team}"];
            if (string.IsNullOrWhiteSpace(wikiUrl))
                return Array.Empty<PlanningSprintGoal>();

            var pageReference = AzureDevOpsWikiPageReference.Parse(wikiUrl, _settings.Organization);
            var page = pageReference.PageId.HasValue
                ? await _wiki.GetPageByIdAsync(
                    pageReference.Organization, pageReference.Project, pageReference.WikiIdentifier, pageReference.PageId.Value, true, ct)
                : await _wiki.GetPageAsync(pageReference.WikiIdentifier, pageReference.PagePath!, true, null, ct);

            if (page == null)
                return Array.Empty<PlanningSprintGoal>();

            return PlanningSprintGoalMarkdownParser.Parse(page.Content, team);
        }

        public Task<TestPlanProgressDto> GetTestPlanProgressAsync(
            string sheetId,
            int planId,
            int suiteId,
            CancellationToken ct = default)
            => _testPlans.GetTestPlanProgressAsync(sheetId, planId, suiteId, ct);

        public Task<TestPlanProgressDto> GetTestPlanProgressBySuiteNameAsync(
            string sheetId,
            int planId,
            string suiteName,
            CancellationToken ct = default)
            => _testPlans.GetTestPlanProgressBySuiteNameAsync(sheetId, planId, suiteName, ct);
    }
}
