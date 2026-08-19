using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class RetroHighlight
    {
        public int Id { get; set; }
        public string BoardKey { get; set; } = null!;
        public string SprintName { get; set; } = null!;
        public string SprintPath { get; set; } = null!;
        public string TeamId { get; set; } = null!;
        public string TeamName { get; set; } = null!;
        public string SourceKey { get; set; } = null!;
        public string Title { get; set; } = null!;
        public string Text { get; set; } = null!;
        public string Detail { get; set; } = string.Empty;
        public string Color { get; set; } = "var(--gold)";
        public bool IsLocked { get; set; }
        public bool IsActive { get; set; } = true;
        public int SortOrder { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
