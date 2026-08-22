using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions
{
    public interface IAzureDevOpsService
    {
        //public Task<List<Domain.Entities.TeamMember>> GetTeamMembersAsync(DeveloperTeam team);

        public Task<List<AvekiScrum.Domain.Entities.Scrum.TeamMemberDto>> GetTeamMembersAsync(DeveloperTeam team);
        public Task<byte[]> GetImageBytesAsync(string imageUrl);

        public Task<Image> LoadImageFromUrlAsync(string imageUrl);

        //public Task<WorkItemResponse> GetWorkItemsAsync(DeveloperTeam team, string iterationPath);
        public Task<IReadOnlyList<Sprint>> GetIterationsAsync(DeveloperTeam team, CancellationToken ct = default);

        Task<IterationStoryPointsResult> GetIterationStoryPointsAsync(DeveloperTeam team, string iterationPath, DateTime sprintStart, DateTime sprintEnd, CancellationToken ct);

        //public Task<List<DeveloperStoryPoints>> GetStoryPointsAtIterationStartAsync(
        //DeveloperTeam team,
        //string iterationPath,
        //DateTime startDate,
        //CancellationToken cancellationToken = default);

        public Task<List<DeveloperStoryPoints>> GetCompletedStoryPointsAsync(
            DeveloperTeam team,
            string iterationPath,
            DateTime startDate,
            DateTime endDate,
            CancellationToken cancellationToken = default);

        //public Task<List<BoardColumn>> GetBoardColumnsAsync(string board);
        public Task<IReadOnlyList<WorkItemDto>> GetAllWorkItemsWithDetailsAsync(string iterationPath, DeveloperTeam team, CancellationToken ct);
        Task<IReadOnlyList<WorkItemDto>> GetIterationWorkItemsAsync(string iterationPath, IEnumerable<string> areaPaths, IEnumerable<WorkItemType> workItemTypes, CancellationToken ct);
        Task<WorkItemUpdatesRoot> GetWorkItemUpdatesAsync(int workItemId, CancellationToken ct = default);
        Task<IReadOnlyList<int>> RunWiqlIdsAsync(string wiql, CancellationToken ct = default);
        Task<IReadOnlyList<WorkItemDto>> GetWorkItemsDetailsAsync(IReadOnlyList<int> workItemIds, CancellationToken ct = default);
        Task UpdateWorkItemFieldsAsync(int workItemId, IReadOnlyDictionary<string, object?> fields, CancellationToken ct = default);
        Task<WorkItemDetailDto?> GetWorkItemDetailAsync(int workItemId, CancellationToken ct = default);
        Task<(byte[] Bytes, string ContentType)> GetWorkItemAttachmentAsync(Guid attachmentId, string? fileName, CancellationToken ct = default);
        Task<(Guid Id, string ProxyUrl, string AzureUrl)> UploadWorkItemAttachmentAsync(byte[] bytes, string fileName, string contentType, CancellationToken ct = default);
        Task<IReadOnlyList<PlanningSprintGoal>> GetSprintGoalsAsync(DeveloperTeam team, CancellationToken ct = default);
        Task<int> CreateTaskAsync(int parentId, string title, string? activity, string? assignedTo, string? state, string? areaPath, string? iterationPath, CancellationToken ct = default);
        Task<int> CreateRelatedUserStoryAsync(int relatedToId, string title, string? assignedTo, string? areaPath, string? iterationPath, CancellationToken ct = default);
        Task<int> CreateWorkItemAsync(string workItemType, IReadOnlyDictionary<string, object?> fields, int? linkToId, string? linkRel, CancellationToken ct = default);
        Task AddWorkItemCommentAsync(int workItemId, string text, CancellationToken ct = default);
        Task DeleteWorkItemAsync(int workItemId, CancellationToken ct = default);
        Task AddWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default);
        Task RemoveWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default);
        /// <summary>All area paths (true) or iteration paths (false) in the project, for the pickers.</summary>
        Task<IReadOnlyList<string>> GetClassificationPathsAsync(bool areas, CancellationToken ct = default);
        Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct = default);
        /// <summary>Picklists the process template defines for one work item type, by field ref name.</summary>
        Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetWorkItemTypeFieldOptionsAsync(string workItemType, CancellationToken ct = default);
        //public Task<WorkItemWithFields> GetWorkItemDetailsAsync(int workItemId);
        //public Task<List<WorkItemWithFields>> GetWorkItemsDetailsAsync(List<int> workItemIds);
        ////public Task<List<TeamCapacity>> GetTeamCapacityAsync(string project, string team, string iterationId);
        //public Task<List<WorkItemWithFields>> GetFullHierarchyAsync(List<int> featureIds);
        //public Task<List<WorkItemNode>> BuildStoryBugNodesWithRelations(List<WorkItemWithFields> sprintItems);

        //public Task<List<WorkItemQuery>> GetQueriesAsync(string folderPath);

        //public Task<List<RepoTestScanResult>> ScanReposForTestProjectsAsync();

        //public Task<WikiListResponse> GetWikisAsync();

        public Task<WikiPageDto> GetWikiRootPageAsync(string wikiId);

        //public Task<string> GetWikiPageContentAsync(string wikiId, string wikiPath);

        public Task<WikiPageDto> GetWikiPageAsync(string wikiId, string wikiPath, bool includeContent = true, int? version = null, CancellationToken ct = default);

        Task<IReadOnlyList<string>> GetTeamAreaPathsAsync(DeveloperTeam team, CancellationToken ct = default);

        //Repos
        Task<IReadOnlyList<RepoInfo>> ListRepositoriesAsync(CancellationToken ct = default);
        Task<IReadOnlyList<PullRequestInfo>> ListActivePullRequestsAsync(string repoId, CancellationToken ct = default);
        Task<PullRequestDetails> GetPullRequestDetailsAsync(string repoId, int prId, CancellationToken ct = default);
        Task<IReadOnlyList<ChangedFile>> GetPullRequestChangedFilesAsync(string repoId, int prId, CancellationToken ct = default);
        Task<string> GetFileContentAtCommitAsync(string repoId, string filePath, string commitId, CancellationToken ct = default);
        Task<IReadOnlyList<PullRequestDto>> GetCompletedPullRequestsAsync(PullRequestOptions prOptions);
        Task<IReadOnlyList<PrThread>> GetPullRequestThreadsAsync(string repositoryIdOrName, int pullRequestId);
        Task<TestingTaskMetricsSummary> GetTestWorkItemMetrics(IEnumerable<string> areaPaths, DateTimeOffset from, DateTimeOffset to, CancellationToken ct);
        Task<TestPlanProgressDto> GetTestPlanProgressAsync(string sheetId, int planId, int suiteId, CancellationToken ct = default);
        Task<TestPlanProgressDto> GetTestPlanProgressBySuiteNameAsync(string sheetId, int planId, string suiteName, CancellationToken ct = default);
    }
}
