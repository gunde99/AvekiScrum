using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Helpers;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public class SprintCapacityPlanDto
    {
        public int Id { get; set; }
        public string TeamName { get; set; } = null!;
        public string DeveloperName { get; set; } = null!;
        public string IterationPath { get; set; } = null!;
        public DateTime SprintStartDate { get; set; }
        public DateTime SprintEndDate { get; set; }
        public double? EstimatedCapacitySP { get; set; }   // Självskattad kapacitet i SP
        public double? PlannedCapacitySP { get; set; }   // Inplanerad kapacitet i SP
        public double? ActualCapacitySP { get; set; }   // Faktisk kapacitet (slutförda kort) i SP


        public double? LastSprintEstimatedCapacitySP { get; set; }   // Självskattad kapacitet i SP från senaste sprinten
        public double? LastSprintPlannedCapacitySP { get; set; } // Inplanerad kapacitet i SP från senaste sprinten
        public double? LastSprintActualCapacitySP { get; set; } // Faktisk kapacitet (slutförda kort) i SP från senaste sprinten

        //Property som räknar ut antalet veckodagar i sprinten, summerar alla Hours i Leave och drar ifrån Hours div 8 från antalet dagar
        public double? AvailableSprintDays => ScrumCalculations.AvailableDays(SprintStartDate, SprintEndDate, Leaves);

        public ICollection<DeveloperLeave> Leaves { get; set; } = new List<DeveloperLeave>();
    }
}
