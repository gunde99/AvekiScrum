using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class WikiUpsertResultDto
    {
        public string Path { get; set; } = "";
        public int? Version { get; set; }         // om API:et returnerar versioner
        public string Url { get; set; }
        public string Comment { get; set; }
        public bool CreatedOrUpdated { get; set; }
        public string Content { get; set; }
        public string ETag { get; set; }
    }
}
