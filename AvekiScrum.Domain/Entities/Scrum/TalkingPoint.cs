using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    /// <summary>
    /// One "Sak att ta upp" - a note prepared ahead of a daily (often on a PO's request) that should
    /// be raised with a specific person once the daily reaches them. Stored per Team (see
    /// JsonFileTalkingPointRepository), independent of any sprint - unlike DailyCheckIn, a talking
    /// point survives across sprints until either raised-and-cleared or deleted by hand.
    /// </summary>
    public sealed class TalkingPoint
    {
        public string Id { get; set; } = "";

        public string Team { get; set; } = "";

        /// <summary>Rich text (html), same shape as a work item's Description field - pasted images
        /// included via the shared /api/attachments upload path.</summary>
        public string BodyHtml { get; set; } = "";

        public string AssigneeEmail { get; set; } = "";

        public string AssigneeDisplayName { get; set; } = "";

        public string CreatedByEmail { get; set; } = "";

        public string CreatedByDisplayName { get; set; } = "";

        public DateTimeOffset CreatedAt { get; set; }

        /// <summary>Ticked off once actually raised during a daily. Left false when a turn is
        /// skipped or run out of time - it simply comes up again next time.</summary>
        public bool Raised { get; set; }

        public DateTimeOffset? RaisedAt { get; set; }
    }
}
