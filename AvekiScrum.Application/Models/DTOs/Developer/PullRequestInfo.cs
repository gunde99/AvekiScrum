// PullRequestInfo.cs
// NuGet: dotnet add package DiffPlex
// Target: net8.0-windows; UseWindowsForms = true

using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Application.Models.DTOs.Developer
{
    public class PullRequestInfo
    {
        public int PullRequestId { get; set; }
        public string Title { get; set; }
        public string Status { get; set; }
        public string SourceBranch { get; set; } = "";
        public string TargetBranch { get; set; } = "";
        public string CreatedBy { get; set; } = "";
        public string CreatedByUniqueName { get; set; } = "";
        public DateTime UpdatedOn { get; set; }
        public DateTimeOffset CreationDate { get; set; }
        public DateTimeOffset? ClosedDate { get; set; }
        public List<Reviewer> Reviewers { get; set; } = new();
        public GitRepository Repository { get; set; }
    }
    public class IdentityRef { public string? DisplayName { get; set; } public string? UniqueName { get; set; } public string? Id { get; set; } }
    public sealed class Reviewer : IdentityRef
    {
        public int Vote { get; set; } // -10 reject, 10 approve etc.
        public bool IsRequired { get; set; }
    }
    public sealed class GitRepository { public string? Id { get; set; } public string? Name { get; set; } }

    public sealed class PrThreadsRoot { [JsonPropertyName("value")] public List<PrThread>? Value { get; set; } }
    public sealed class PrThread
    {
        public int Id { get; set; }
        public DateTimeOffset? PublishedDate { get; set; }
        public List<PrComment> Comments { get; set; }
        public string Status { get; set; } // active, fixed, bydesign ...
    }
    public sealed class PrComment
    {
        public int Id { get; set; }
        public string Content { get; set; }
        public string CommentType { get; set; }    // text, codeChange etc.
        public IdentityRef? Author { get; set; }
        public DateTimeOffset? PublishedDate { get; set; }
    }

    // Output KPI for PR
    public sealed class PrMetrics
    {
        public required int PrId { get; init; }
        public required string Repository { get; init; }
        public required string Title { get; init; }
        public required string Author { get; init; }
        public required DateTimeOffset Created { get; init; }
        public required DateTimeOffset Closed { get; init; }
        public required TimeSpan CycleTime { get; init; }
        public TimeSpan? TimeToFirstReview { get; init; }
        public int TotalComments { get; init; }
        public int UnresolvedThreads { get; init; }
        public int ReviewerCount { get; init; }
        public int ApproveVotes { get; init; }
        public int RejectVotes { get; init; }
    }
}
