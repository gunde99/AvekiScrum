using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Application.Abstractions.Ports
{
    public interface IWikiService
    {
        Task<IReadOnlyList<WikiInfoDto>> ListWikisAsync(CancellationToken ct = default);
        Task<WikiPageDto> GetWikiRootPageAsync(string wikiId, CancellationToken ct = default);
        Task<WikiPageDto> GetPageAsync(string wikiIdOrName, string path, bool includeContent = true, int? version = null, CancellationToken ct = default);
        Task<IReadOnlyList<WikiSearchResult>> SearchPagesAsync(string wikiIdOrName, string searchText, CancellationToken ct = default);

        Task<WikiUpsertResultDto> UpsertPageAsync(
            string wikiIdOrName,
            string path,
            string content,
            string comment = null,
            string expectedETag = null,
            CancellationToken ct = default);

        Task<bool> DeletePageAsync(
            string wikiIdOrName,
            string path,
            string expectedETag = null,
            CancellationToken ct = default);

        Task<WikiPageDto> MovePageAsync(
            string wikiIdOrName,
            string sourcePath,
            string destinationPath,
            string expectedETag = null,
            CancellationToken ct = default);
    }
}