using System.Collections.Generic;
using System.Linq;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public static class WikiEntityExtensions
    {
        public static WikiInfoDto ToDto(this WikiRepositoryItem e)
        {
            if (e == null) return new WikiInfoDto();

            return new WikiInfoDto
            {
                Id = e.Id ?? "",
                Name = e.Name ?? e.Repository?.Name ?? "",
                ProjectId = e.ProjectId ?? "",
                RepositoryId = e.Repository?.Id,
                RepositoryName = e.Repository?.Name,
                RepositoryWebUrl = e.Repository?.WebUrl
            };
        }

        public static WikiPageDto ToDto(this WikiPage e, bool includeContent = true)
        {
            var dto = new WikiPageDto
            {
                Path = e?.Path ?? "",
                Order = e?.Order ?? 0,
                IsParentPage = e?.IsParentPage,
                GitItemPath = e?.GitItemPath,
                Url = e?.Url,
                RemoteUrl = e?.RemoteUrl,
                Content = includeContent ? e?.Content : null
            };

            if (e?.SubPages != null)
            {
                foreach (var child in e.SubPages)
                    dto.SubPages.Add(child.ToDto(includeContent));
            }

            return dto;
        }

        public static List<WikiPageDto> ToDtoList(this IEnumerable<WikiPage> pages, bool includeContent = true)
            => pages?.Select(p => p.ToDto(includeContent)).ToList() ?? new();

        public static List<WikiInfoDto> ToDtoList(this IEnumerable<WikiRepositoryItem> items)
            => items?.Select(i => i.ToDto()).ToList() ?? new();
    }
}
