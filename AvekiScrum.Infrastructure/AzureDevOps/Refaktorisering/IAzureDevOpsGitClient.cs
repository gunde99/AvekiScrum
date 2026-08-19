using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Developer;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public interface IAzureDevOpsGitClient
    {
        Task<IReadOnlyList<RepoInfo>> ListRepositoriesAsync(CancellationToken ct = default);

        Task<IReadOnlyList<PullRequestInfo>> ListActivePullRequestsAsync(
            string repoId,
            CancellationToken ct = default);

        Task<IReadOnlyList<PullRequestDto>> GetCompletedPullRequestsAsync(
            PullRequestOptions options,
            CancellationToken ct = default);

        Task<IReadOnlyList<PrThread>> GetPullRequestThreadsAsync(
            string repositoryIdOrName,
            int pullRequestId,
            CancellationToken ct = default);

        Task<PullRequestDetails> GetPullRequestDetailsAsync(
            string repoId,
            int pullRequestId,
            CancellationToken ct = default);

        Task<IReadOnlyList<ChangedFile>> GetPullRequestChangedFilesAsync(
            string repoId,
            int prId,
            CancellationToken ct = default);

        Task<string> GetFileContentAtCommitAsync(
            string repoId,
            string filePath,
            string commitId,
            CancellationToken ct = default);

        Task<IReadOnlyList<RepoTestScanResult>> ScanReposForTestProjectsAsync(
            CancellationToken ct = default);
    }
}
