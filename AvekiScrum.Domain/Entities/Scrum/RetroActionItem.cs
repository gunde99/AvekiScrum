using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class RetroActionItem
    {
        public int Id { get; set; }
        public string BoardKey { get; set; } = null!;
        public int? SourceCardId { get; set; }
        public string SprintName { get; set; } = null!;
        public string SprintPath { get; set; } = null!;
        public string TeamId { get; set; } = null!;
        public string TeamName { get; set; } = null!;
        public string Text { get; set; } = null!;
        public string ItemType { get; set; } = "action";
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }
}
