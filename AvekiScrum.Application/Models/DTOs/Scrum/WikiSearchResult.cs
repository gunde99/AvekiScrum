using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public class WikiSearchResult
    {
        public string Path { get; set; }
        public string MatchedSnippet { get; set; }
        public DateTime? LastUpdated { get; set; }
        public string Url { get; set; }
    }
}
