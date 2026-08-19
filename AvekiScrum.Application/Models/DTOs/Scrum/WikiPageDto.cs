using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class WikiPageDto
    {
        public string Path { get; init; } = "";
        public int Order { get; init; }
        public bool? IsParentPage { get; init; } 
        public string Title { get; init; }
        public string GitItemPath { get; init; }
        public string Url { get; init; }
        public string RemoteUrl { get; init; }
        public string Content { get; init; }

        public List<WikiPageDto> SubPages { get; set; } = new();
        public int Id { get; set; }
        public string LastUpdatedBy { get; set; }
        public int Version { get; set; }
        public string ETag { get; set; }
        public DateTime? LastUpdated { get; set; }
    }
}
