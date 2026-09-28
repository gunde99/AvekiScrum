using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps.Entities;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public interface IAzureDevOpsBoardsClient
    {
        string Project { get; }

        Task<IReadOnlyList<Sprint>> GetIterationsAsync(DeveloperTeam team, CancellationToken ct = default);
        Task<Sprint?> GetCurrentIterationAsync(DeveloperTeam team, CancellationToken ct = default);

        Task<IReadOnlyList<string>> GetTeamAreaPathsAsync(
            DeveloperTeam team,
            CancellationToken ct = default);

        Task<IReadOnlyList<WorkItemDto>> GetIterationWorkItemsAsync(
            string iterationPath,
            IEnumerable<string> areaPaths,
            IEnumerable<WorkItemType> workItemTypes = null,
            CancellationToken ct = default);

        Task<IReadOnlyList<int>> RunWiqlIdsAsync(
            string wiql,
            CancellationToken ct = default);

        Task<WorkItemWithFields?> GetWorkItemDetailsAsync(
            int workItemId,
            CancellationToken ct = default);

        Task<IReadOnlyList<WorkItemDto>> GetWorkItemsDetailsAsync(
            IReadOnlyList<int> workItemIds,
            CancellationToken ct = default);

        Task<IReadOnlyList<WorkItemRevision>> GetRevisionsAsync(
            int workItemId,
            CancellationToken ct = default);

        Task<WorkItemUpdatesRoot> GetWorkItemUpdatesAsync(
            int workItemId,
            CancellationToken ct = default);

        Task UpdateWorkItemFieldsAsync(
            int workItemId,
            IReadOnlyDictionary<string, object?> fields,
            CancellationToken ct = default);

        Task<IReadOnlyList<Entities.WorkItemCommentEntity>> GetWorkItemCommentsAsync(
            int workItemId,
            CancellationToken ct = default);

        Task<(byte[] Bytes, string ContentType)> GetAttachmentAsync(
            Guid attachmentId,
            string? fileName,
            CancellationToken ct = default);

        Task<Entities.AttachmentReference> UploadAttachmentAsync(
            byte[] bytes,
            string fileName,
            string contentType,
            CancellationToken ct = default);

        Task<int> CreateTaskAsync(
            int parentId,
            string title,
            string? activity,
            string? assignedTo,
            string? state,
            string? areaPath,
            string? iterationPath,
            CancellationToken ct = default);

        /// <summary>
        /// Creates a new User Story linked to <paramref name="relatedToId"/> via
        /// System.LinkTypes.Related (not Parent-Child) - used for the "hjälptext" DoR category,
        /// which is being broken out of the development story into its own related card.
        /// </summary>
        Task<int> CreateRelatedUserStoryAsync(
            int relatedToId,
            string title,
            string? assignedTo,
            string? areaPath,
            string? iterationPath,
            CancellationToken ct = default);

        /// <summary>
        /// Creates a work item of any type, optionally linked to another one via `linkRel`
        /// ("System.LinkTypes.Hierarchy-Reverse" for a child, "System.LinkTypes.Related" for a
        /// sibling). The two methods above are the fixed-shape cases the DoR flow needs; this is
        /// the general one the card view creates from.
        /// </summary>
        Task<int> CreateWorkItemAsync(
            string workItemType,
            IReadOnlyDictionary<string, object?> fields,
            int? linkToId,
            string? linkRel,
            CancellationToken ct = default);

        Task AddWorkItemCommentAsync(int workItemId, string text, CancellationToken ct = default);

        /// <summary>
        /// Creates a Task in a *different* Azure DevOps project than this client's configured one -
        /// AvekiDokumentation's "Beställ hjälptext" button, which creates the card directly in the
        /// Dokumentation project (parented under its BESTÄLLNING story) instead of as a child Task
        /// or satellite User Story here in Utveckling. Additive to <see cref="CreateRelatedUserStoryAsync"/>,
        /// which a different, older button still uses unchanged.
        /// </summary>
        /// <param name="targetProject">The other project's name, e.g. "Dokumentation".</param>
        /// <param name="parentStoryId">Work item id of the bucket story to parent the new Task under.</param>
        /// <param name="relatedWorkItemId">The card in *this* client's project that the text belongs to - linked Related, never Child, so it never blocks that card from closing.</param>
        Task<int> CreateCrossProjectHelpTextTaskAsync(
            string targetProject,
            int parentStoryId,
            string title,
            string? descriptionHtml,
            string? assignedTo,
            int relatedWorkItemId,
            CancellationToken ct = default);

        /// <summary>Deletes a work item into the project's recycle bin (recoverable).</summary>
        Task DeleteWorkItemAsync(int workItemId, CancellationToken ct = default);

        Task AddWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default);

        /// <summary>Removes the link of type <paramref name="linkRel"/> to <paramref name="targetId"/>.</summary>
        Task RemoveWorkItemRelationAsync(int workItemId, int targetId, string linkRel, CancellationToken ct = default);

        /// <summary>All area paths (true) or iteration paths (false) in the project.</summary>
        Task<IReadOnlyList<string>> GetClassificationPathsAsync(bool areas, CancellationToken ct = default);

        /// <summary>The iteration tree with each node's start and finish dates.</summary>
        Task<IReadOnlyList<IterationNodeDto>> GetIterationNodesAsync(CancellationToken ct = default);

        Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct = default);

        /// <summary>Picklists the process template defines for one work item type, by field ref name.</summary>
        Task<IReadOnlyDictionary<string, IReadOnlyList<string>>> GetWorkItemTypeFieldOptionsAsync(
            string workItemType,
            CancellationToken ct = default);

        /// <summary>Every Azure DevOps team in the project - offers the Refinement board's
        /// product-backlog team picker whichever teams exist, not just Nord/Syd.</summary>
        Task<IReadOnlyList<AzureTeamDto>> GetProjectTeamsAsync(CancellationToken ct = default);

        /// <summary>
        /// The product backlog: a team's "Features" board, swimlane/column config included, with
        /// each Feature's Epic-parent chain and User Story/Bug children resolved for context.
        /// </summary>
        Task<ProductBacklogDto> GetProductBacklogAsync(
            string boardTeam,
            string? tag,
            string? iterationPath,
            string? areaPath,
            CancellationToken ct = default);

        /// <summary>
        /// The Refinement board's "sprint" source: a single iteration's Features/User Stories/Bugs,
        /// with Feature/Epic parents resolved regardless of the parent's own iteration (a Feature is
        /// rarely itself scheduled into a sprint) so the hierarchy still has real context.
        /// </summary>
        Task<ProductBacklogDto> GetRefinementSprintAsync(
            string iterationPath,
            IEnumerable<string> areaPaths,
            CancellationToken ct = default);

        /// <summary>
        /// The Refinement board's "tagged cards" source: every card (any type, any sprint) under
        /// the team's area paths and under one release's iteration tree (e.g. "Utveckling\27.1")
        /// that carries the given tag - no board, no forced hierarchy expansion beyond the Epic
        /// chain above each match.
        /// </summary>
        Task<ProductBacklogDto> GetTaggedRefinementItemsAsync(
            string iterationPathPrefix,
            IEnumerable<string> areaPaths,
            string tag,
            CancellationToken ct = default);

        /// <summary>
        /// The Refinement board's "custom search" source: an id or a title fragment, matched
        /// against every work item in the project regardless of team/area/iteration - the same
        /// lookup the "länka befintligt kort" picker uses, capped at 50 hits.
        /// </summary>
        Task<ProductBacklogDto> SearchRefinementItemsAsync(
            string query,
            CancellationToken ct = default);
    }
}
