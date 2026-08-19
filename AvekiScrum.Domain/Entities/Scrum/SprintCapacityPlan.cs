using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class SprintCapacityPlan
    {
        public int Id { get; set; }
        public string TeamName { get; set; } = null!;
        public string DeveloperName { get; set; } = null!;
        public string IterationPath { get; set; } = null!;
        public DateTime SprintStartDate { get; set; }
        public DateTime SprintEndDate { get; set; }
        public double? EstimatedCapacitySP { get; set; }   // Självskattad kapacitet i SP
        public double? PlannedCapacitySP { get; set; }   // Självskattad kapacitet i SP
        public double? ActualCapacitySP { get; set; }   // Faktisk kapacitet i SP (bokförs i slutet av sprinten)

        public ICollection<DeveloperLeave> Leaves { get; set; } = new List<DeveloperLeave>();
    }

}
