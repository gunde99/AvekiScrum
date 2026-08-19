using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public class IterationStoryPointsResult
    {
        public List<WorkItemStoryPoints> Planned { get; set; } = new();
        public List<WorkItemStoryPoints> Completed { get; set; } = new();
        public List<WorkItemDto> SprintBacklog { get; set; } = new();
    }

    public class WorkItemStoryPoints
    {
        public string AssignedTo { get; set; } = null!;
        public double? TotalStoryPoints { get; set; }
        public int WorkItemId { get; set; }
    }
}
