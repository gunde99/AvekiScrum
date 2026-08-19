using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Abstractions;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal sealed class AzureDevOpsGitClient : IAzureDevOpsGitClient
    {
        private readonly IAzureDevOpsRestClient _rest;
        private readonly ILogger<AzureDevOpsGitClient> _logger;

        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };

        public AzureDevOpsGitClient(
            IAzureDevOpsRestClient rest,
            ILogger<AzureDevOpsGitClient> logger)
        {
            _rest = rest;
            _logger = logger;
        }

        #region Repos

        public async Task<IReadOnlyList<RepoInfo>> ListRepositoriesAsync(CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetRepositoriesUrl();
            var json = await _rest.GetStringAsync(url, ct);
            var doc = JsonSerializer.Deserialize<AzList<AzRepo>>(json, JsonOptions);

            return doc?.Value
                .Select(v => new RepoInfo(v.Id, v.Name))
                .ToList()
                ?? new List<RepoInfo>();
        }

        public async Task<IReadOnlyList<RepoTestScanResult>> ScanReposForTestProjectsAsync(CancellationToken ct = default)
        {
            var results = new List<RepoTestScanResult>();

            var reposUrl = AzureUrlHelper.GetReposUrl();
            var reposJson = await _rest.GetStringAsync(reposUrl, ct);
            using var reposDoc = JsonDocument.Parse(reposJson);

            var repos = reposDoc.RootElement.GetProperty("value");

            foreach (var repo in repos.EnumerateArray())
            {
                ct.ThrowIfCancellationRequested();

                var repoName = repo.GetProperty("name").GetString();
                var repoId = repo.GetProperty("id").GetString();
                var branch = repo.GetProperty("defaultBranch").GetString()
                                ?.Replace("refs/heads/", "") ?? "main";

                var itemsUrl = AzureUrlHelper.GetRepoItemsUrl(repoId!, branch);
                try
                {
                    var itemsJson = await _rest.GetStringAsync(itemsUrl, ct);
                    using var itemsDoc = JsonDocument.Parse(itemsJson);
                    var items = itemsDoc.RootElement.GetProperty("value");

                    var csprojs = items.EnumerateArray()
                        .Where(i => i.TryGetProperty("path", out var pathProp)
                                    && pathProp.GetString()!
                                        .EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
                        .Select(i => i.GetProperty("path").GetString() ?? "")
                        .ToList();

                    var testProjects = csprojs.Count(p =>
                        p.EndsWith(".Tests.csproj", StringComparison.OrdinalIgnoreCase) ||
                        p.EndsWith(".Test.csproj", StringComparison.OrdinalIgnoreCase));

                    results.Add(new RepoTestScanResult
                    {
                        RepositoryName = repoName!,
                        TotalProjects = csprojs.Count,
                        TestProjects = testProjects
                    });
                }
                catch (HttpRequestException ex)
                {
                    _logger.LogWarning(ex, "Failed to scan repo {RepoName} ({RepoId})", repoName, repoId);
                    results.Add(new RepoTestScanResult
                    {
                        RepositoryName = repoName!,
                        TotalProjects = 0,
                        TestProjects = 0
                    });
                }
            }

            return results;
        }

        #endregion

        #region Pull Requests

        public async Task<IReadOnlyList<PullRequestInfo>> ListActivePullRequestsAsync(
            string repoId,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetPullRequestsUrl(repoId);
            var json = await _rest.GetStringAsync(url, ct);
            var response = JsonSerializer.Deserialize<AzList<AzPullRequest>>(json, JsonOptions);

            return response?.Value
                .Select(p => new PullRequestInfo
                {
                    PullRequestId = p.PullRequestId,
                    Title = p.Title,
                    CreatedBy = p.CreatedBy?.DisplayName ?? "okänd",
                    CreatedByUniqueName = p.CreatedBy?.UniqueName ?? "",
                    CreationDate = p.CreationDate,
                    Status = p.Status ?? "unknown",
                    SourceBranch = StripRefHead(p.SourceRefName),
                    TargetBranch = StripRefHead(p.TargetRefName),
                    Reviewers = p.Reviewers?
                        .Where(reviewer => !string.IsNullOrWhiteSpace(reviewer.DisplayName) ||
                                           !string.IsNullOrWhiteSpace(reviewer.UniqueName))
                        .Select(reviewer => new Reviewer
                        {
                            DisplayName = reviewer.DisplayName,
                            UniqueName = reviewer.UniqueName,
                            Id = reviewer.Id,
                            Vote = reviewer.Vote ?? 0,
                            IsRequired = reviewer.IsRequired ?? false
                        })
                        .ToList() ?? new List<Reviewer>()
                })
                .ToList()
                ?? new List<PullRequestInfo>();
        }

        public async Task<IReadOnlyList<PullRequestDto>> GetCompletedPullRequestsAsync(
            PullRequestOptions options,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetPullRequestsUrl(options);
            var json = await _rest.GetStringAsync(url, ct);

            var root = JsonSerializer.Deserialize<AzList<AzPullRequest>>(json, JsonOptions)
                       ?? throw new InvalidOperationException("Deserialize null for " + url);

            return root.Value?
                       .Select(p => ToPullRequestDto(p, options.RepositoryIdOrName))
                       .ToList()
                   ?? new List<PullRequestDto>();
        }

        public async Task<IReadOnlyList<PrThread>> GetPullRequestThreadsAsync(
            string repositoryIdOrName,
            int pullRequestId,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetPullRequestThreadssUrl(repositoryIdOrName, pullRequestId.ToString());
            var json = await _rest.GetStringAsync(url, ct);
            var root = JsonSerializer.Deserialize<PrThreadsRoot>(json, JsonOptions);
            return root?.Value ?? new();
        }

        public async Task<PullRequestDetails> GetPullRequestDetailsAsync(
            string repoId,
            int pullRequestId,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetPullRequestDetailsUrl(repoId, pullRequestId);
            var json = await _rest.GetStringAsync(url, ct);
            var pr = JsonSerializer.Deserialize<AzPullRequest>(json, JsonOptions)
                     ?? throw new InvalidOperationException("PR saknas.");

            return new PullRequestDetails(
                pr.LastMergeSourceCommit?.CommitId ?? pr.LastMergeCommit?.CommitId ?? "",
                pr.LastMergeTargetCommit?.CommitId ?? "",
                pr.Status ?? "",
                BuildPullRequestWebUrl(repoId, pullRequestId),
                pr.CreationDate,
                pr.ClosedDate,
                pr.Reviewers?
                    .Where(reviewer => !string.IsNullOrWhiteSpace(reviewer.DisplayName))
                    .Select(reviewer => reviewer.DisplayName)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>(),
                StripRefHead(pr.SourceRefName),
                StripRefHead(pr.TargetRefName),
                pr.Reviewers?
                    .Where(reviewer => reviewer.IsRequired == true && !string.IsNullOrWhiteSpace(reviewer.DisplayName))
                    .Select(reviewer => reviewer.DisplayName)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList() ?? new List<string>(),
                pr.CreatedBy?.DisplayName ?? "",
                pr.CreatedBy?.UniqueName ?? "",
                pr.Title ?? "",
                pr.Reviewers?
                    .Where(reviewer => !string.IsNullOrWhiteSpace(reviewer.DisplayName))
                    .Select(reviewer => new PrReviewerVote(reviewer.DisplayName, reviewer.Vote ?? 0, reviewer.IsRequired ?? false))
                    .ToList() ?? new List<PrReviewerVote>());
        }

        public async Task<IReadOnlyList<ChangedFile>> GetPullRequestChangedFilesAsync(
            string repoId,
            int prId,
            CancellationToken ct = default)
        {
            // 1. Hämta iterationer
            var iterationsUrl = AzureUrlHelper.GetPullRequestIterationsUrl(repoId, prId);
            var itersJson = await _rest.GetStringAsync(iterationsUrl, ct);
            var iters = JsonSerializer.Deserialize<AzList<AzIteration>>(itersJson, JsonOptions);

            var latest = iters?.Value?
                            .OrderByDescending(i => i.Id)
                            .FirstOrDefault()
                         ?? throw new InvalidOperationException("Inga iterationer hittades för PR.");

            // 2. Hämta changes för senaste iteration
            var changesUrl = AzureUrlHelper.GetPullRequestIterationChangesUrl(
                repoId, prId, latest.Id);

            var changesJson = await _rest.GetStringAsync(changesUrl, ct);

            var files = new List<ChangedFile>();

            // Försök tolka form 1
            try
            {
                var v1 = JsonSerializer.Deserialize<AzIterationChangesV1>(changesJson, JsonOptions);
                files.AddRange(ExtractFromChangeEntries(v1));
            }
            catch { /* ignore */ }

            // Fallback: form 2
            if (files.Count == 0)
            {
                try
                {
                    var v2 = JsonSerializer.Deserialize<AzList<AzChange>>(changesJson, JsonOptions);
                    files.AddRange(ExtractFromAzChanges(v2));
                }
                catch { /* ignore */ }
            }

            files = files
                .Where(f => !string.IsNullOrWhiteSpace(f.Path))
                .Select(f => new ChangedFile(f.Path.Replace('\\', '/')))
                .GroupBy(f => f.Path.ToLowerInvariant())
                .Select(g => g.First())
                .ToList();

            // Fallback: commit diff
            if (files.Count == 0)
            {
                var details = await GetPullRequestDetailsAsync(repoId, prId, ct);
                var diffUrl = AzureUrlHelper.GetDiffsBetweenCommitsUrl(
                    repoId, details.TargetCommit, details.SourceCommit);

                var diffJson = await _rest.GetStringAsync(diffUrl, ct);
                var diffPayload = JsonSerializer.Deserialize<AzCommitDiff>(diffJson, JsonOptions);

                files = ExtractFilesFromCommitDiff(diffPayload);
            }

            return files;
        }

        public async Task<string?> GetFileContentAtCommitAsync(
            string repoId,
            string filePath,
            string commitId,
            CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(commitId)) return null;

            var url = AzureUrlHelper.GetFileContentAtCommitUrl(repoId, filePath, commitId);

            try
            {
                return await _rest.GetStringAsync(url, ct);
            }
            catch (HttpRequestException ex) when (ex.Message.Contains("404"))
            {
                // Fallback med download=true
                var urlDl = AzureUrlHelper.GetFileContentAtCommitFallbackUrl(repoId, filePath, commitId);
                return await _rest.GetStringAsync(urlDl, ct);
            }
        }

        #endregion

        #region DTOs + helpers (Azure-specifika)

        private sealed record AzList<T>(
            [property: JsonPropertyName("value")] IReadOnlyList<T> Value);

        private sealed record AzRepo(
            [property: JsonPropertyName("id")] string Id,
            [property: JsonPropertyName("name")] string Name);

        private sealed record AzUser(
            [property: JsonPropertyName("displayName")] string DisplayName,
            [property: JsonPropertyName("uniqueName")] string? UniqueName,
            [property: JsonPropertyName("id")] string? Id,
            [property: JsonPropertyName("vote")] int? Vote,
            [property: JsonPropertyName("isRequired")] bool? IsRequired);

        private sealed record AzCommit(
            [property: JsonPropertyName("commitId")] string CommitId);

        private sealed record AzPullRequest(
            [property: JsonPropertyName("pullRequestId")] int PullRequestId,
            [property: JsonPropertyName("title")] string Title,
            [property: JsonPropertyName("creationDate")] DateTime CreationDate,
            [property: JsonPropertyName("closedDate")] DateTime? ClosedDate,
            [property: JsonPropertyName("status")] string Status,
            [property: JsonPropertyName("sourceRefName")] string? SourceRefName,
            [property: JsonPropertyName("targetRefName")] string? TargetRefName,
            [property: JsonPropertyName("createdBy")] AzUser? CreatedBy,
            [property: JsonPropertyName("reviewers")] IReadOnlyList<AzUser>? Reviewers,
            [property: JsonPropertyName("lastMergeSourceCommit")] AzCommit? LastMergeSourceCommit,
            [property: JsonPropertyName("lastMergeTargetCommit")] AzCommit? LastMergeTargetCommit,
            [property: JsonPropertyName("lastMergeCommit")] AzCommit? LastMergeCommit);

        private static string BuildPullRequestWebUrl(string repoId, int pullRequestId)
            => $"https://dev.azure.com/Aveki/Utveckling/_git/{Uri.EscapeDataString(repoId)}/pullrequest/{pullRequestId}";

        private static PullRequestDto ToPullRequestDto(AzPullRequest pr, string repositoryIdOrName)
            => new()
            {
                PullRequestId = pr.PullRequestId,
                Status = pr.Status ?? string.Empty,
                CreatedUtc = ToUtcNullable(pr.CreationDate),
                ClosedUtc = ToUtcNullable(pr.ClosedDate),
                Title = pr.Title ?? string.Empty,
                WebUrl = BuildPullRequestWebUrl(repositoryIdOrName, pr.PullRequestId),
                SourceRef = pr.SourceRefName ?? string.Empty,
                TargetRef = pr.TargetRefName ?? string.Empty,
                SourceBranch = StripRefHead(pr.SourceRefName),
                TargetBranch = StripRefHead(pr.TargetRefName),
                RepositoryId = repositoryIdOrName,
                RepositoryName = repositoryIdOrName,
                CreatedBy = pr.CreatedBy == null
                    ? null
                    : new IdentityDto
                    {
                        DisplayName = pr.CreatedBy.DisplayName,
                        UniqueName = pr.CreatedBy.UniqueName,
                        Id = pr.CreatedBy.Id
                    },
                Reviewers = pr.Reviewers?
                    .Where(reviewer => !string.IsNullOrWhiteSpace(reviewer.DisplayName))
                    .Select(reviewer => new ReviewerDto
                    {
                        DisplayName = reviewer.DisplayName,
                        UniqueName = reviewer.UniqueName,
                        Id = reviewer.Id,
                        Vote = reviewer.Vote ?? 0,
                        IsRequired = reviewer.IsRequired ?? false
                    })
                    .ToArray() ?? Array.Empty<ReviewerDto>(),
                Merge = new MergeStateDto
                {
                    LastSource = MapCommitRef(pr.LastMergeSourceCommit),
                    LastTarget = MapCommitRef(pr.LastMergeTargetCommit),
                    LastMerge = MapCommitRef(pr.LastMergeCommit)
                }
            };

        private static CommitRefDto? MapCommitRef(AzCommit? commit)
            => commit == null
                ? null
                : new CommitRefDto { CommitId = commit.CommitId ?? string.Empty };

        private static string StripRefHead(string? value)
        {
            var branch = (value ?? string.Empty).Trim();
            const string refsHeads = "refs/heads/";
            return branch.StartsWith(refsHeads, StringComparison.OrdinalIgnoreCase)
                ? branch.Substring(refsHeads.Length)
                : branch;
        }

        private static DateTime? ToUtcNullable(DateTime value)
            => value == default
                ? null
                : value.Kind == DateTimeKind.Utc
                    ? value
                    : value.ToUniversalTime();

        private static DateTime? ToUtcNullable(DateTime? value)
            => value.HasValue ? ToUtcNullable(value.Value) : null;

        private sealed record AzIteration(
            [property: JsonPropertyName("id")] int Id,
            [property: JsonPropertyName("sourceRefCommit")] AzCommit? SourceRefCommit,
            [property: JsonPropertyName("targetRefCommit")] AzCommit? TargetRefCommit,
            [property: JsonPropertyName("commonRefCommit")] AzCommit? CommonRefCommit);

        private sealed record AzItem(
            [property: JsonPropertyName("path")] string? Path,
            [property: JsonPropertyName("objectId")] string? ObjectId,
            [property: JsonPropertyName("originalObjectId")] string? OriginalObjectId,
            [property: JsonPropertyName("gitObjectType")] string? GitObjectType);

        private sealed record AzChange(
            [property: JsonPropertyName("item")] AzItem? Item,
            [property: JsonPropertyName("changeType")] string? ChangeType);

        private sealed record AzDiffChange(
            [property: JsonPropertyName("item")] AzItem? Item,
            [property: JsonPropertyName("changeType")] string? ChangeType);

        private sealed record AzCommitDiff(
            [property: JsonPropertyName("changes")] IReadOnlyList<AzDiffChange> Changes);

        private sealed record AzChangeEntry(
            [property: JsonPropertyName("changeTrackingId")] int ChangeTrackingId,
            [property: JsonPropertyName("changeId")] int ChangeId,
            [property: JsonPropertyName("item")] AzItem? Item,
            [property: JsonPropertyName("changeType")] string? ChangeType);

        private sealed record AzIterationChangesV1(
            [property: JsonPropertyName("changeEntries")] AzChangeEntry[]? ChangeEntries);

        private static List<ChangedFile> ExtractFromChangeEntries(AzIterationChangesV1? payload)
        {
            var result = new List<ChangedFile>();

            foreach (var e in payload?.ChangeEntries ?? Array.Empty<AzChangeEntry>())
            {
                var p = e.Item?.Path;
                if (!string.IsNullOrWhiteSpace(p))
                    result.Add(new ChangedFile(p));
            }

            return result
                .GroupBy(x => x.Path.Replace('\\', '/').ToLowerInvariant())
                .Select(g => g.First())
                .ToList();
        }

        private static List<ChangedFile> ExtractFromAzChanges(AzList<AzChange>? payload)
        {
            var result = new List<ChangedFile>();

            foreach (var c in payload?.Value ?? Array.Empty<AzChange>())
            {
                var p = c.Item?.Path;
                if (!string.IsNullOrWhiteSpace(p))
                    result.Add(new ChangedFile(p));
            }

            return result
                .GroupBy(x => x.Path.Replace('\\', '/').ToLowerInvariant())
                .Select(g => g.First())
                .ToList();
        }

        private static List<ChangedFile> ExtractFilesFromCommitDiff(AzCommitDiff? payload)
        {
            var result = new List<ChangedFile>();

            foreach (var ch in payload?.Changes ?? Array.Empty<AzDiffChange>())
            {
                if (ch.Item?.GitObjectType?.Equals("blob", StringComparison.OrdinalIgnoreCase) == true &&
                    !string.IsNullOrEmpty(ch.Item.Path))
                {
                    result.Add(new ChangedFile(ch.Item.Path));
                }
            }

            return result
                .GroupBy(x => x.Path.Replace('\\', '/').ToLowerInvariant())
                .Select(g => g.First())
                .ToList();
        }

        #endregion
    }

}
