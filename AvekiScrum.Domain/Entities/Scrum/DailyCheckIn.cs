using System;

namespace AvekiScrum.Domain.Entities.Scrum
{
    /// <summary>
    /// One incheckningssiffra from a daily-flow turn - either a developer's own energy (Kind
    /// "developer"), a sprint goal's confidence (Kind "goal"), or one of the closing PO/test-lead
    /// turns (Kind "po"/"testlead"). Identity is (Team, SprintPath, Date, Kind, Key) - see
    /// IDailyCheckInRepository.UpsertAsync for why a later save with the same identity overwrites
    /// rather than duplicates (a practice run of the daily flow before the real one, say).
    /// </summary>
    public sealed class DailyCheckIn
    {
        public string Team { get; set; } = "";

        /// <summary>The iteration path - stable identity for the sprint even across a name reuse.</summary>
        public string SprintPath { get; set; } = "";

        /// <summary>Display name ("sp1") - kept alongside SprintPath so the stored file reads on
        /// its own without cross-referencing Azure DevOps.</summary>
        public string SprintName { get; set; } = "";

        /// <summary>The calendar day the daily was run - the day, not the moment, is what a repeat
        /// save within the same day overwrites.</summary>
        public DateOnly Date { get; set; }

        /// <summary>"developer" | "goal" | "po" | "testlead" - which flow turn this came from.</summary>
        public string Kind { get; set; } = "";

        /// <summary>The flow step's own key - a developer/goal group id, or "po"/"testlead".</summary>
        public string Key { get; set; } = "";

        /// <summary>Display label at the time of check-in (person name, goal title, "Product Owner",
        /// "Testansvarig") - a convenience for reading the stored file, not part of the identity.</summary>
        public string Label { get; set; } = "";

        public double Score { get; set; }
    }
}
