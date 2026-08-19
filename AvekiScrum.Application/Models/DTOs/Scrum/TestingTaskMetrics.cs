using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    // Output KPI for Testing Tasks
    public sealed class TestingTaskMetrics
    {
        public required int Id { get; set; }
        public required string Title { get; init; }
        public required DateTimeOffset Created { get; init; }
        public DateTimeOffset? FirstAssignedAt { get; init; }
        public TimeSpan? PickupLatency => FirstAssignedAt is null ? null : FirstAssignedAt - Created;
        public DateTimeOffset? CompletedAt { get; init; }
        public TimeSpan? ActiveTestingDuration { get; init; } // Sum tid i "Active/In Progress" innan Complete
        public bool HadEjOkTag { get; init; }
        public string FinalState { get; init; }

    }

    public class TestingTaskMetricsSummary
    {
        public int TotalTasks { get; set; }
        public int TasksCreatedInWindow { get; set; }
        public int TasksClosedInWindow { get; set; }
        public Dictionary<string, int> TasksByState { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, int> TasksByAssignedTo { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    
        public List<TestingTaskMetrics> DetailedMetrics { get; set; } = new();


        public static TestingTaskMetricsSummary Empty => new TestingTaskMetricsSummary
        {
            TotalTasks = 0,
            TasksCreatedInWindow = 0,
            TasksClosedInWindow = 0,
            TasksByState = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase),
            TasksByAssignedTo = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase),
            DetailedMetrics = new List<TestingTaskMetrics>()
        };
    }
}
