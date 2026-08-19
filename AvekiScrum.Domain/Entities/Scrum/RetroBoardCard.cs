using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class RetroBoardCard
    {
        public int Id { get; set; }
        public string BoardKey { get; set; } = null!;
        public string SprintName { get; set; } = null!;
        public string SprintPath { get; set; } = null!;
        public string TeamId { get; set; } = null!;
        public string TeamName { get; set; } = null!;
        public string ColumnKey { get; set; } = null!;
        public string Text { get; set; } = null!;
        public int SortOrder { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
