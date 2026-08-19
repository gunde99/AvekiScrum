using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;

namespace AvekiScrum.Application.Models.DTOs
{
    public static class SprintBacklogExtensions
    {
        public static List<T> SafeToList<T>(this IEnumerable<T> source)
        {
            return source?.ToList() ?? new List<T>();
        }

        //return all stories that are not assigned to any team member
        public static List<WorkItemDto> GetUnassignedStories(this IEnumerable<WorkItemDto> sprintBacklog)
        {
            return sprintBacklog?.Where(s => s.AssignedTo == null).OrderBy(s => s.State).SafeToList() ?? new List<WorkItemDto>();
        }

        //return all stories that have no story points assigned
        public static List<WorkItemDto> GetStoriesMissingStoryPoints(this IEnumerable<WorkItemDto> sprintBacklog)
        {
            return sprintBacklog?.Where(s => s.StoryPoints <= 0).OrderBy(s => s.State).SafeToList() ?? new List<WorkItemDto>();
        }

        //return all stories that have story points greater than or equal to 8
        public static List<WorkItemDto> GetLargeStories(this IEnumerable<WorkItemDto> sprintBacklog, double threshold = 8)
        {
            return sprintBacklog?.Where(s => s.StoryPoints >= threshold).OrderBy(s => s.State).SafeToList() ?? new List<WorkItemDto>();
        }

        // Return all work items that have the specified tag (case-insensitive)
        public static List<WorkItemDto> GetTaggedItems(this IEnumerable<WorkItemDto> sprintBacklog, string tag)
        {
            if (string.IsNullOrWhiteSpace(tag))
                return new List<WorkItemDto>();
            return sprintBacklog?.Where(s => s.Tags != null && s.Tags.Contains(tag, StringComparer.OrdinalIgnoreCase))
                                .OrderBy(s => s.State)
                                .SafeToList() ?? new List<WorkItemDto>();
        }

        // Return all work items that have the specified tags (case-insensitive)
        public static List<WorkItemDto> GetTaggedItems(this IEnumerable<WorkItemDto> sprintBacklog, IEnumerable<string> tags)
        {
            if (tags == null || !tags.Any())
                return new List<WorkItemDto>();
            var tagSet = new HashSet<string>(tags, StringComparer.OrdinalIgnoreCase);
            return sprintBacklog?.Where(s => s.Tags != null && s.Tags.Any(t => tagSet.Contains(t)))
                                .OrderBy(s => s.State)
                                .SafeToList() ?? new List<WorkItemDto>();
        }

        public static List<WorkItemDto> GetClosedBugs(this IEnumerable<WorkItemDto> sprintBacklog, WorkItemSource workItemSource = WorkItemSource.Unset, WorkItemSource ignoredWorkItemSource = WorkItemSource.Unset)
        {
            var items = sprintBacklog?.Where(s => s.TypeEnum == WorkItemType.Bug &&
                                            (s.StateEnum == WorkItemState.Done || s.StateEnum == WorkItemState.Closed))
                                .OrderBy(s => s.State)
                                .SafeToList() ?? new List<WorkItemDto>();

            if (workItemSource == WorkItemSource.Unset && ignoredWorkItemSource == WorkItemSource.Unset)
                return items;

            if (workItemSource == WorkItemSource.Unset)
                return items.Where(s => s.SourceEnum != ignoredWorkItemSource).SafeToList();
            else if (ignoredWorkItemSource == WorkItemSource.Unset)
                return items.Where(s => s.SourceEnum == workItemSource).SafeToList();
            else
                return items.Where(s => s.SourceEnum == workItemSource && s.SourceEnum != ignoredWorkItemSource).SafeToList();
        }

        public static List<WorkItemDto> GetResolvedBugs(this IEnumerable<WorkItemDto> sprintBacklog, WorkItemSource workItemSource = WorkItemSource.Unset, WorkItemSource ignoredWorkItemSource = WorkItemSource.Unset)
        {
            var items = sprintBacklog?.Where(s => s.TypeEnum == WorkItemType.Bug &&
                                            s.StateEnum == WorkItemState.Resolved)
                                .OrderBy(s => s.State)
                                .SafeToList() ?? new List<WorkItemDto>();

            if (workItemSource == WorkItemSource.Unset && ignoredWorkItemSource == WorkItemSource.Unset)
                return items;

            if (workItemSource == WorkItemSource.Unset)
                return items.Where(s => s.SourceEnum != ignoredWorkItemSource).SafeToList();
            else if (ignoredWorkItemSource == WorkItemSource.Unset)
                return items.Where(s => s.SourceEnum == workItemSource).SafeToList();
            else
                return items.Where(s => s.SourceEnum == workItemSource && s.SourceEnum != ignoredWorkItemSource).SafeToList();
        }
    }
}
