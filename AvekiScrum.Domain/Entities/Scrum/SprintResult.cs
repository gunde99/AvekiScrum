using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class SprintResult
    {
        public int Id { get; set; }
        public string TeamName { get; set; } = null!;
        public string DeveloperName { get; set; } = null!;
        public string IterationPath { get; set; } = null!;
        public DateTime SprintEndDate { get; set; }
        public int CompletedStoryPoints { get; set; }
    }

}
