using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    /// <summary>
    /// Project-scoped state owned by the sprint planning board.
    /// Azure DevOps remains the source of truth for work items and tags.
    /// </summary>
    public sealed class PlaneringsBoardState
    {
        public string AzureProject { get; set; } = string.Empty;
        public string StateType { get; set; } = string.Empty;
        public string StateKey { get; set; } = string.Empty;
        public string Json { get; set; } = "{}";
        public double? TheoreticalDays { get; set; }
        public int? Workdays { get; set; }
        public DateTime SavedUtc { get; set; }
    }
}
