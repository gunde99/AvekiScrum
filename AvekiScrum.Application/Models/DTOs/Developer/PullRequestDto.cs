#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Resources;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using AvekiScrum.Application.Models.DTOs.Developer;

namespace AvekiScrum.Application.Models.DTOs;

/// <summary>
/// Minimal, transportvänlig representation av en AzDO Pull Request.
/// Avsikt: UI/rapportering, serialisering, caching.
/// </summary>
public sealed record PullRequestDto
{
    // Id & status
    public int PullRequestId { get; init; }
    public int CodeReviewId { get; init; }
    public string Status { get; init; } = string.Empty;
    public bool? IsDraft { get; init; }
    public bool HasMultipleMergeBases { get; init; }

    // Tidsstämplar (UTC)
    public DateTime? CreatedUtc { get; init; }
    public DateTime? ClosedUtc { get; init; }
    public DateTime? CompletionQueueUtc { get; init; }

    // Titel/desc
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }

    // Brancher
    public string SourceRef { get; init; } = string.Empty;
    public string TargetRef { get; init; } = string.Empty;
    public string SourceBranch { get; init; } = string.Empty; // refs/heads-strippad
    public string TargetBranch { get; init; } = string.Empty;

    // Urls & Artifact
    public string? WebUrl { get; init; }
    public string? ApiUrl { get; init; }
    public string? RemoteUrl { get; init; }
    public string? ArtifactId { get; init; }

    // Repo & projekt
    public string RepositoryId { get; init; } = string.Empty;
    public string RepositoryName { get; init; } = string.Empty;
    public string ProjectId { get; init; } = string.Empty;
    public string ProjectName { get; init; } = string.Empty;

    // Identiteter
    public IdentityDto? CreatedBy { get; init; }
    public IdentityDto? ClosedBy { get; init; }
    public IdentityDto? AutoCompleteSetBy { get; init; }

    // Merge-info
    public MergeStateDto Merge { get; init; } = new();

    // Reviewer/Labels/Commits/WorkItems (ofta tunga → flaggstyrt)
    public IReadOnlyList<ReviewerDto> Reviewers { get; init; } = Array.Empty<ReviewerDto>();
    public IReadOnlyList<string> Labels { get; init; } = Array.Empty<string>();
    public IReadOnlyList<CommitDto> Commits { get; init; } = Array.Empty<CommitDto>();
    public IReadOnlyList<int> WorkItemIds { get; init; } = Array.Empty<int>();

    // Här kan du utöka med ForkSource, CompletionOptions etc vid behov.
}

public sealed class PullRequestSimpleDto
{
    public int PullRequestId { get; set; }
    public Guid RepoId { get; set; }
    public string Title { get; set; } = "";
    public string Status { get; set; } = "";   // Active/Completed/Abandoned
    public string WebUrl { get; set; } = "";
    public DateTime? CreatedDate { get; set; }
    public string CreatedBy { get; set; } = "";
    public string CreatedByUniqueName { get; set; } = "";
}

public record IdentityDto
{
    public string? Id { get; init; }
    public string? UniqueName { get; init; }
    public string? DisplayName { get; init; }
    public string? ImageUrl { get; init; }
}

public sealed record ReviewerDto : IdentityDto
{
    public int Vote { get; init; }            // -10..10 i AzDO
    public bool IsRequired { get; init; }
    public bool? HasDeclined { get; init; }   // om modellen finns
}

public sealed record CommitDto
{
    public string CommitId { get; init; } = string.Empty;
    public Guid RepoId { get; set; } = Guid.Empty;
    public DateTime? Date { get; set; }
    public string? Comment { get; init; }
    public string? Url { get; init; }
    public string? RemoteUrl { get; init; }
    public SignatureDto? Author { get; init; }
    public SignatureDto? Committer { get; init; }
}

public sealed record SignatureDto
{
    public string? Name { get; init; }
    public string? Email { get; init; }
    public DateTime? WhenUtc { get; init; }
}

public sealed record MergeStateDto
{
    public string AsyncStatus { get; init; } = string.Empty;  // PullRequestAsyncStatus → string
    public string? FailureType { get; init; }                 // PullRequestMergeFailureType → string
    public string? FailureMessage { get; init; }
    public Guid? MergeId { get; init; }

    public CommitRefDto? LastSource { get; init; }
    public CommitRefDto? LastTarget { get; init; }
    public CommitRefDto? LastMerge { get; init; }
}

public sealed record CommitRefDto
{
    public string CommitId { get; init; } = string.Empty;
    public string? Url { get; init; }
}
