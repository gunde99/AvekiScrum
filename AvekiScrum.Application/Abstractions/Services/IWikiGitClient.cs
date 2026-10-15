using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Abstractions.Services
{
    /// <summary>
    /// The upgrade wiki's git repository, driven entirely through the Azure DevOps REST API - the
    /// consultants never run git themselves. Branches are checkouts, commits are saves, and a pull
    /// request is only the server-side merge mechanism behind "Lämna in"; nobody is expected to open
    /// it in Azure DevOps.
    /// </summary>
    public interface IWikiGitClient
    {
        /// <summary>The branch's current commit id, or null if the branch doesn't exist.</summary>
        Task<string?> GetBranchHeadAsync(string branch, CancellationToken ct = default);

        /// <summary>Every file and folder under <paramref name="path"/>, recursively, at a branch or commit.</summary>
        Task<IReadOnlyList<WikiGitItem>> ListTreeAsync(string path, WikiGitVersion version, CancellationToken ct = default);

        /// <summary>A text file's content, or null if it doesn't exist at that version.</summary>
        Task<string?> GetFileTextAsync(string path, WikiGitVersion version, CancellationToken ct = default);

        /// <summary>A file's raw bytes (images under /.attachments), or null if missing.</summary>
        Task<(byte[] Bytes, string ContentType)?> GetFileBytesAsync(string path, WikiGitVersion version, CancellationToken ct = default);

        Task CreateBranchAsync(string branch, string fromCommit, CancellationToken ct = default);

        /// <summary>Deletes the branch if it exists. Returns false if it was already gone.</summary>
        Task<bool> DeleteBranchAsync(string branch, CancellationToken ct = default);

        /// <summary>
        /// One commit on top of <paramref name="expectedHead"/>. Returns null when the branch has moved
        /// on since (someone else saved in between) - the caller decides what to tell the user.
        /// </summary>
        Task<string?> PushAsync(string branch, string expectedHead, IReadOnlyList<WikiGitChange> changes, string comment, CancellationToken ct = default);

        Task<int> CreatePullRequestAsync(string sourceBranch, string targetBranch, string title, string description, CancellationToken ct = default);

        /// <summary>The PR's state once Azure DevOps has finished evaluating the merge (waits a few seconds at most).</summary>
        Task<WikiPullRequest> WaitForMergeStatusAsync(int pullRequestId, CancellationToken ct = default);

        Task<IReadOnlyList<WikiMergeConflict>> GetConflictsAsync(int pullRequestId, CancellationToken ct = default);

        /// <summary>Resolves one edit/edit conflict with the user's merged text.</summary>
        Task ResolveConflictAsync(int pullRequestId, int conflictId, string mergedContent, CancellationToken ct = default);

        /// <summary>Squash-merges the PR into its target and deletes the source branch. Returns the merge commit id.</summary>
        Task<string?> CompletePullRequestAsync(int pullRequestId, string commitMessage, CancellationToken ct = default);

        Task AbandonPullRequestAsync(int pullRequestId, CancellationToken ct = default);
    }

    /// <summary>A branch name or an exact commit id.</summary>
    public readonly record struct WikiGitVersion(string Value, bool IsCommit)
    {
        public static WikiGitVersion OfBranch(string branch) => new(branch, false);
        public static WikiGitVersion OfCommit(string commitId) => new(commitId, true);
    }

    public sealed record WikiGitItem(string Path, bool IsFolder, string ObjectId);

    public enum WikiGitChangeType { Add, Edit, Delete }

    public sealed record WikiGitChange(WikiGitChangeType Type, string Path, string? Content);

    public sealed record WikiPullRequest(int Id, string Status, string MergeStatus, string? MergeCommitId);

    public sealed record WikiMergeConflict(
        int ConflictId,
        string ConflictType,
        string Path,
        string? BaseCommit,
        string? SourceCommit,
        string? TargetCommit);
}
