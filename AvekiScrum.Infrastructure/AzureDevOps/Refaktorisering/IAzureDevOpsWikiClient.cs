using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public interface IAzureDevOpsWikiClient
    {
        Task<IReadOnlyList<WikiInfoDto>> ListWikisAsync(CancellationToken ct = default);

        Task<WikiPageDto?> GetPageAsync(
            string wikiIdOrName,
            string path,
            bool includeContent = true,
            int? version = null,
            CancellationToken ct = default);

        /// <summary>
        /// Skapar eller uppdaterar en wikisida. Om expectedVersion anges använder vi If-Match.
        /// </summary>
        Task<WikiUpsertResultDto> UpsertPageAsync(
            string wikiIdOrName,
            string path,
            string content,
            string? comment = null,
            string? expectedETag = null,
            CancellationToken ct = default);

        Task<bool> DeletePageAsync(
            string wikiIdOrName,
            string path,
            string? expectedETag = null,
            CancellationToken ct = default);

        Task<IReadOnlyList<WikiSearchResult>> SearchPagesAsync(
            string wikiIdOrName,
            string searchText,
            CancellationToken ct = default);

        Task<WikiPageDto> GetWikiRootPageAsync(string wikiId);

        Task<WikiPageDto?> GetPageByIdAsync(
            string wikiIdOrName,
            int pageId,
            bool includeContent = true,
            CancellationToken ct = default);

        /// <summary>Same as the other overload, but for a wiki living in a different org/project than
        /// this app's configured default (e.g. a team's sprint-goals wiki in another ADO project).</summary>
        Task<WikiPageDto?> GetPageByIdAsync(
            string organization,
            string project,
            string wikiIdOrName,
            int pageId,
            bool includeContent = true,
            CancellationToken ct = default);
    }
}
