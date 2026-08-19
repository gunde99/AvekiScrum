// Infrastructure/AzureDevOps/AzureDevOpsWikiClient.cs
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps.Entities;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal sealed class AzureDevOpsWikiClient : IAzureDevOpsWikiClient
    {
        private readonly IAzureDevOpsRestClient _rest;
        private readonly ILogger<AzureDevOpsWikiClient> _logger;

        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };

        public AzureDevOpsWikiClient(
            IAzureDevOpsRestClient rest,
            ILogger<AzureDevOpsWikiClient> logger)
        {
            _rest = rest;
            _logger = logger;
        }

        public async Task<WikiPageDto> GetWikiRootPageAsync(string wikiId)
        {
            var wikiUrl = AzureUrlHelper.GetWikiPagesUrl(wikiId);
            var json = await _rest.GetStringAsync(wikiUrl);
            var rootPage = System.Text.Json.JsonSerializer.Deserialize<WikiPage>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return AzureDevopsMapper.ToDto(rootPage);
        }

        public async Task<IReadOnlyList<WikiInfoDto>> ListWikisAsync(CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetWikiUrl();
            var json = await _rest.GetStringAsync(url, ct);
            var root = JsonSerializer.Deserialize<WikiListRoot>(json, JsonOptions);
            return root?.Value?.Select(w => new WikiInfoDto(){Id = w.Id, Name = w.Name ?? w.Id, Type = w.Type})?.ToList()
                   ?? new List<WikiInfoDto>();
        }

        public async Task<WikiPageDto?> GetPageAsync(
            string wikiIdOrName,
            string path,
            bool includeContent = true,
            int? version = null,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetWikiPageUrl(wikiIdOrName, path, includeContent, version);
            var response = await _rest.GetAsync(url, ct);

            var dto = JsonSerializer.Deserialize<AzWikiPage>(response.Body, JsonOptions);

            return dto is null
                ? null
                : new WikiPageDto
                {
                    Content = dto.Content ?? string.Empty,
                    Path = dto.Path ?? path,
                    Id = dto.Id,
                    Url = dto.Url ?? "",
                    Version = dto.Version?.Version ?? 0,
                    LastUpdatedBy = dto.LastUpdatedBy?.DisplayName ?? "",
                    LastUpdated = dto.LastUpdated,
                    ETag = response.ETag
                };
        }

        public async Task<WikiPageDto?> GetPageByIdAsync(
            string wikiIdOrName,
            int pageId,
            bool includeContent = true,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetWikiPageByIdUrl(wikiIdOrName, pageId, includeContent);
            var response = await _rest.GetAsync(url, ct);

            var dto = JsonSerializer.Deserialize<AzWikiPage>(response.Body, JsonOptions);

            return dto is null
                ? null
                : new WikiPageDto
                {
                    Content = dto.Content ?? string.Empty,
                    Path = dto.Path ?? "",
                    Id = dto.Id,
                    Url = dto.Url ?? "",
                    Version = dto.Version?.Version ?? 0,
                    LastUpdatedBy = dto.LastUpdatedBy?.DisplayName ?? "",
                    LastUpdated = dto.LastUpdated,
                    ETag = response.ETag
                };
        }

        public async Task<WikiPageDto?> GetPageByIdAsync(
            string organization,
            string project,
            string wikiIdOrName,
            int pageId,
            bool includeContent = true,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.GetWikiPageByIdUrl(organization, project, wikiIdOrName, pageId, includeContent);
            var response = await _rest.GetAsync(url, ct);

            var dto = JsonSerializer.Deserialize<AzWikiPage>(response.Body, JsonOptions);

            return dto is null
                ? null
                : new WikiPageDto
                {
                    Content = dto.Content ?? string.Empty,
                    Path = dto.Path ?? "",
                    Id = dto.Id,
                    Url = dto.Url ?? "",
                    Version = dto.Version?.Version ?? 0,
                    LastUpdatedBy = dto.LastUpdatedBy?.DisplayName ?? "",
                    LastUpdated = dto.LastUpdated,
                    ETag = response.ETag
                };
        }

        public async Task<IReadOnlyList<WikiSearchResult>> SearchPagesAsync(
            string wikiIdOrName,
            string searchText,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.SearchWikiUrl(wikiIdOrName, searchText);
            var json = await _rest.GetStringAsync(url, ct);
            var root = JsonSerializer.Deserialize<WikiSearchRoot>(json, JsonOptions);

            return root?.Results?
                       .Select(r => new WikiSearchResult() { Path = r.Path ?? "", MatchedSnippet = r.Snippet ?? "", LastUpdated = r.LastUpdated, Url = r.Url })
                       .ToList()
                   ?? new List<WikiSearchResult>();
        }

        public async Task<WikiUpsertResultDto> UpsertPageAsync(
            string wikiIdOrName,
            string path,
            string content,
            string? comment = null,
            string? expectedETag = null,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.PutWikiPageUrl(wikiIdOrName, path, comment);
            var response = await _rest.PutJsonAsync(url, new { content }, expectedETag, ct);

            var dto = JsonSerializer.Deserialize<AzWikiPage>(response.Body, JsonOptions)
                     ?? throw new InvalidOperationException("Empty wiki upsert response.");

            return new WikiUpsertResultDto
            {
                Path = dto.Path ?? path,
                Version = dto.Version?.Version ?? 0,
                Url = dto.Url ?? "",
                ETag = response.ETag,
                Comment = comment ?? "",
                CreatedOrUpdated = true,
                Content = content
            };
        }

        public Task<bool> DeletePageAsync(
            string wikiIdOrName,
            string path,
            string? expectedETag = null,
            CancellationToken ct = default)
        {
            var url = AzureUrlHelper.DeleteWikiPageUrl(wikiIdOrName, path);

            try
            {
                return _rest.DeleteAsync(url, expectedETag, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete wiki page {Wiki}/{Path}", wikiIdOrName, path);
                return Task.FromResult(false);
            }
        }

        // ---- Interna DTOs ----

        private sealed record WikiListRoot([property: JsonPropertyName("value")] List<AzWiki>? Value);
        private sealed record AzWiki([property: JsonPropertyName("id")] string Id,
                                     [property: JsonPropertyName("name")] string? Name,
                                     [property: JsonPropertyName("type")] string Type);
        private sealed record AzVersion([property: JsonPropertyName("version")] int Version);
        private sealed record AzUser([property: JsonPropertyName("displayName")] string? DisplayName);
        private sealed record AzWikiPage(
            [property: JsonPropertyName("id")] int Id,
            [property: JsonPropertyName("path")] string? Path,
            [property: JsonPropertyName("content")] string? Content,
            [property: JsonPropertyName("_links")] object? Links,
            [property: JsonPropertyName("url")] string? Url,
            [property: JsonPropertyName("eTag")] string? ETag,
            [property: JsonPropertyName("version")] AzVersion? Version,
            [property: JsonPropertyName("lastUpdatedBy")] AzUser? LastUpdatedBy,
            [property: JsonPropertyName("lastUpdated")] DateTime? LastUpdated);

        private sealed record WikiSearchRoot(
            [property: JsonPropertyName("count")] int Count,
            [property: JsonPropertyName("results")] List<AzWikiSearchResult>? Results);

        private sealed record AzWikiSearchResult(
            [property: JsonPropertyName("path")] string? Path,
            [property: JsonPropertyName("snippet")] string? Snippet,
            [property: JsonPropertyName("lastUpdated")] DateTime? LastUpdated,
            [property: JsonPropertyName("url")] string? Url);
    }
}
