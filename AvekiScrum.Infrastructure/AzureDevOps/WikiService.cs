using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions.Ports;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public sealed class WikiService : IWikiService
    {
        private readonly IAzureDevOpsWikiClient _client;

        public WikiService(IAzureDevOpsWikiClient client)
        {
            _client = client ?? throw new ArgumentNullException(nameof(client));
        }

        public Task<IReadOnlyList<WikiInfoDto>> ListWikisAsync(CancellationToken ct = default)
            => _client.ListWikisAsync(ct);

        public Task<WikiPageDto> GetWikiRootPageAsync(string wikiId, CancellationToken ct = default)
            => _client.GetWikiRootPageAsync(wikiId);

        public Task<WikiPageDto?> GetPageAsync(
            string wikiIdOrName, string path,
            bool includeContent = true, int? version = null,
            CancellationToken ct = default)
            => _client.GetPageAsync(wikiIdOrName, path, includeContent, version, ct);

        public Task<IReadOnlyList<WikiSearchResult>> SearchPagesAsync(
            string wikiIdOrName, string searchText,
            CancellationToken ct = default)
            => _client.SearchPagesAsync(wikiIdOrName, searchText, ct);

        public Task<WikiUpsertResultDto> UpsertPageAsync(
            string wikiIdOrName,
            string path,
            string content,
            string? comment = null,
            string? expectedETag = null,
            CancellationToken ct = default)
            => _client.UpsertPageAsync(wikiIdOrName, path, content, comment, expectedETag, ct);

        public Task<bool> DeletePageAsync(
            string wikiIdOrName,
            string path,
            string? expectedETag = null,
            CancellationToken ct = default)
            => _client.DeletePageAsync(wikiIdOrName, path, expectedETag, ct);

        public async Task<WikiPageDto> MovePageAsync(
            string wikiIdOrName,
            string sourcePath,
            string destinationPath,
            string? expectedETag = null,
            CancellationToken ct = default)
        {
            var source = await _client.GetPageAsync(
                wikiIdOrName,
                sourcePath,
                includeContent: true,
                ct: ct)
                ?? throw new InvalidOperationException($"Sidan '{sourcePath}' hittades inte.");

            await _client.UpsertPageAsync(
                wikiIdOrName,
                destinationPath,
                source.Content ?? "",
                $"Flyttad från {sourcePath}",
                ct: ct);

            await _client.DeletePageAsync(
                wikiIdOrName,
                sourcePath,
                expectedETag ?? source.ETag,
                ct);

            var moved = await _client.GetPageAsync(
                wikiIdOrName,
                destinationPath,
                includeContent: true,
                ct: ct);

            return moved!;
        }
    }
}