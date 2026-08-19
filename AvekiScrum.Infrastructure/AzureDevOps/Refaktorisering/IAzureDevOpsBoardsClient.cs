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
    }
}
