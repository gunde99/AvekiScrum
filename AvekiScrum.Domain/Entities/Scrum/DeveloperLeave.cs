using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class DeveloperLeave
    {
        public int Id { get; set; }
        public DateTime Date { get; set; }
        public double Hours { get; set; }   // 4 = halvdag, 8 = heldag
        public string Reason { get; set; } = null!;  // T.ex. "Semester", "Sjuk", "Föräldraledighet"

        public int SprintCapacityPlanId { get; set; }
        public SprintCapacityPlan SprintCapacityPlan { get; set; } = null!;
    }

}
