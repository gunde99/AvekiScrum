using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class WikiInfoDto
    {
        public string Id { get; init; } = "";
        public string Name { get; init; } = "";
        public string ProjectId { get; init; } = "";

        // Bekvämlighet (hämtat från Repository om man vill visa länkar i UI)
        public string RepositoryId { get; init; } = "";
        public string RepositoryName { get; init; } = "";
        public string RepositoryWebUrl { get; init; } = "";
        public string Type { get; set; }
    }
}
