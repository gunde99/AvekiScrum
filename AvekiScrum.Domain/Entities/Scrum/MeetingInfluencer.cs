using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    /// <summary>
    /// One developer drawn in Teamavstämning's "Nästa veckas influencer" lottery - they prepare a
    /// short, freely chosen contribution (Veckans kluring, Visa något smart, ...) for the meeting on
    /// MeetingDate. On that date they show up as agenda point 2, right after Laget runt. Kept per
    /// date rather than overwritten, so the full history also drives the lottery's fair rotation
    /// (nobody is drawn again until everyone else has had a turn).
    /// </summary>
    public sealed class MeetingInfluencer
    {
        public string Id { get; set; } = "";

        /// <summary>The meeting they present at, as "yyyy-MM-dd" (the client's local date).</summary>
        public string MeetingDate { get; set; } = "";

        public string Email { get; set; } = "";

        public string DisplayName { get; set; } = "";

        public DateTimeOffset DrawnAt { get; set; }
    }
}
