using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    /// <summary>
    /// One "Sak att ta upp" - a note prepared ahead of a daily (often on a PO's request) that should
    /// be raised with a specific person once the daily reaches them. Not owned by a single team's
    /// file the way DailyCheckIn is: Scope decides which team(s) it's relevant to, and - since
    /// "Both" can mean it comes up in Nord's daily before Syd's, or vice versa, or never in one of
    /// them at all - each team tracks its own raised state independently.
    /// </summary>
    public sealed class TalkingPoint
    {
        public string Id { get; set; } = "";

        /// <summary>"Nord" | "Syd" | "Both" - which team(s) this is relevant to.</summary>
        public string Scope { get; set; } = "";

        /// <summary>Rich text (html), same shape as a work item's Description field - pasted images
        /// included via the shared /api/attachments upload path.</summary>
        public string BodyHtml { get; set; } = "";

        /// <summary>The special "Scrum Master" pseudo-assignee (see the client's SCRUM_MASTER
        /// sentinel) uses a reserved, non-email value here rather than a real address - it
        /// deliberately never matches a real roster name, so it always falls through to a full tail
        /// turn in DailyFlow regardless of whether that same person already had a developer turn.</summary>
        public string AssigneeEmail { get; set; } = "";

        public string AssigneeDisplayName { get; set; } = "";

        public string CreatedByEmail { get; set; } = "";

        public string CreatedByDisplayName { get; set; } = "";

        public DateTimeOffset CreatedAt { get; set; }

        /// <summary>Ticked off once actually raised during Team Nord's daily. Left false when a turn
        /// is skipped or run out of time - it simply comes up again next time.</summary>
        public bool NordRaised { get; set; }

        public DateTimeOffset? NordRaisedAt { get; set; }

        public bool SydRaised { get; set; }

        public DateTimeOffset? SydRaisedAt { get; set; }
    }
}
