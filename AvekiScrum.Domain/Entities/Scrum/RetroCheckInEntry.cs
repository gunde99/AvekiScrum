using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class RetroCheckInEntry
    {
        public int Id { get; set; }
        public string BoardKey { get; set; } = null!;
        public string SprintName { get; set; } = null!;
        public string SprintPath { get; set; } = null!;
        public string TeamId { get; set; } = null!;
        public string TeamName { get; set; } = null!;
        public string UserId { get; set; } = null!;
        public string DisplayName { get; set; } = null!;
        public string Question { get; set; } = null!;
        public string Answer { get; set; } = string.Empty;
        public double? Rating { get; set; }
        public int SortOrder { get; set; }
        public bool IsPresent { get; set; }
        public bool IsAbsent { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
