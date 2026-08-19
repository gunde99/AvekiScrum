using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class RetroMeetingProtocol
    {
        public int Id { get; set; }
        public string BoardKey { get; set; } = null!;
        public string SprintName { get; set; } = null!;
        public string SprintPath { get; set; } = null!;
        public string TeamId { get; set; } = null!;
        public string TeamName { get; set; } = null!;
        public DateTime MeetingDate { get; set; }
        public string Markdown { get; set; } = null!;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
