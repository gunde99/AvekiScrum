using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Developer
{
    public class PullRequestOptions
    {
        public string RepositoryIdOrName { get; set; } // required
        public string Status { get; set; } = "active"; // active, completed, abandoned, all
        public DateTimeOffset From { get; set; } // filter by creation date
        public DateTimeOffset To { get; set; } // filter by creation date
        public int Top { get; set; } = 100; // max 1000
                                            //public string SourceRefName { get; set; } // e.g. refs/heads/feature/branch
                                            //public string TargetRefName { get; set; } // e.g. refs/heads/main
                                            //public string ReviewerId { get; set; } // filter by reviewer id (GUID)
    }
}
