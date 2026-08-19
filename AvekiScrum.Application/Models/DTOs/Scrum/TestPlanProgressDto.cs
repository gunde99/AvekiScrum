using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class TestPlanProgressDto
    {
        public string SheetId { get; set; } = string.Empty;

        public int PlanId { get; set; }

        public int SuiteId { get; set; }

        public string SuiteName { get; set; } = string.Empty;

        public int Total { get; set; }

        public int Started { get; set; }

        public int Passed { get; set; }

        public int Failed { get; set; }

        public int Blocked { get; set; }

        public int NotRun { get; set; }

        public Dictionary<string, int> Outcomes { get; set; } = new();

        public List<TestPlanPointProgressDto> Points { get; set; } = new();
    }

    public sealed class TestPlanPointProgressDto
    {
        public string Name { get; set; } = string.Empty;

        public string Outcome { get; set; } = string.Empty;

        public string SuiteName { get; set; } = string.Empty;
    }
}
