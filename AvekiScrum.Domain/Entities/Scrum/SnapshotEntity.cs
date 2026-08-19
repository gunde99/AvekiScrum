using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities
{
    public class SprintBoardSnapshot
    {
        public int Id { get; set; }
        public DateTime SnapshotDate { get; set; }
        public string TeamName { get; set; } = null!;
        public string IterationPath { get; set; } = null!;

        public ICollection<WorkItemSnapshot> WorkItems { get; set; } = new List<WorkItemSnapshot>();
    }
}
