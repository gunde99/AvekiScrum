// PullRequestDetails.cs
// NuGet: dotnet add package DiffPlex
// Target: net8.0-windows; UseWindowsForms = true

using System;
using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Developer
{
    public record PullRequestDetails(
        string SourceCommit,
        string TargetCommit,
        string Status = "",
        string WebUrl = "",
        DateTime? CreationDate = null,
        DateTime? ClosedDate = null,
        IReadOnlyList<string>? Reviewers = null,
        string SourceBranch = "",
        string TargetBranch = "",
        IReadOnlyList<string>? RequiredReviewers = null,
        string CreatedBy = "",
        string CreatedByUniqueName = "",
        string Title = "",
        IReadOnlyList<PrReviewerVote>? ReviewerVotes = null);

    /// <summary>-10 reject, -5 waiting for author, 0 no vote, 5 approved with suggestions, 10 approved.</summary>
    public record PrReviewerVote(string DisplayName, int Vote, bool IsRequired);
}
