using System;
using System.Collections.Generic;
using AvekiScrum.Application.Models.DTOs.Developer;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class WorkItemDetailDto
    {
        public int Id { get; set; }
        public string Type { get; set; } = "";
        public string Title { get; set; } = "";
        public string State { get; set; } = "";
        public string? Reason { get; set; }
        public string? AssignedTo { get; set; }
        public string? DevelopmentPartner { get; set; }
        public string? CreatedBy { get; set; }
        public string? AreaPath { get; set; }
        public string? IterationPath { get; set; }
        public double? StoryPoints { get; set; }
        public int? Priority { get; set; }
        public string? Severity { get; set; }
        public string? Source { get; set; }
        public string? ValueArea { get; set; }
        public int? BusinessValue { get; set; }
        public string? Activity { get; set; }
        public double? OriginalEstimate { get; set; }
        public double? RemainingWork { get; set; }
        public double? CompletedWork { get; set; }
        public List<string> Tags { get; set; } = new();
        public string DescriptionHtml { get; set; } = "";
        public string AcceptanceCriteriaHtml { get; set; } = "";
        public string WebUrl { get; set; } = "";
        public DateTime? CreatedDate { get; set; }
        public DateTime? ChangedDate { get; set; }
        public WorkItemRelationRefDto? Parent { get; set; }
        public List<WorkItemRelationRefDto> Children { get; set; } = new();
        public List<WorkItemRelationRefDto> Related { get; set; } = new();
        public List<WorkItemCommentDto> Comments { get; set; } = new();
        public List<WorkItemPullRequestDto> PullRequests { get; set; } = new();
        public List<WorkItemHistoryEntryDto> History { get; set; } = new();
    }

    public sealed class WorkItemPullRequestDto
    {
        public int PullRequestId { get; set; }
        public string RepoId { get; set; } = "";
        public string Title { get; set; } = "";
        public string Status { get; set; } = "";
        public string TargetBranch { get; set; } = "";
        public string WebUrl { get; set; } = "";
        public DateTime? CreatedDate { get; set; }
        public string? CreatedBy { get; set; }
        public List<PrReviewerDto> Reviewers { get; set; } = new();
        public int CommentsTotal { get; set; }
        public int CommentsResolved { get; set; }

        /// <summary>
        /// Set when the PR was linked to one of this card's child tasks rather than to the card
        /// itself, so the UI can say which task it came from. Null for the card's own PRs.
        /// </summary>
        public int? SourceTaskId { get; set; }
        public string? SourceTaskTitle { get; set; }
    }

    public sealed class PrReviewerDto
    {
        public string DisplayName { get; set; } = "";
        public int Vote { get; set; }
        public bool IsRequired { get; set; }
    }

    public sealed class WorkItemHistoryEntryDto
    {
        public DateTimeOffset When { get; set; }
        public string Field { get; set; } = "";
        public string? OldValue { get; set; }
        public string? NewValue { get; set; }
    }

    public sealed class WorkItemRelationRefDto
    {
        public int Id { get; set; }
        public string Type { get; set; } = "";
        public string Title { get; set; } = "";
        public string State { get; set; } = "";
        public string? Activity { get; set; }
    }

    public sealed class WorkItemCommentDto
    {
        public string? Author { get; set; }
        public string TextHtml { get; set; } = "";
        public DateTime? CreatedDate { get; set; }
    }
}
