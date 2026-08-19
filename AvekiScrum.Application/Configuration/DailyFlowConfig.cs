using System;
using System.Collections.Generic;

namespace AvekiScrum.Application.Configuration
{
    /// <summary>
    /// Who the daily flow starts out asking, per team. The board itself is unaffected - someone
    /// left out here still owns cards, still gets a developer group - they just don't get a turn.
    /// </summary>
    public class DailyFlowConfig
    {
        /// <summary>
        /// Keyed by role-group name ("TeamNord" / "TeamSyd"), listing the emails that should start
        /// out unticked in the daily-flow participant picker - long-term absences, people on loan
        /// to another team, and so on. It is only the *initial* state: the picker is saved per
        /// browser, so once the list has been adjusted in the UI this config no longer applies.
        /// </summary>
        public Dictionary<string, List<string>> ExcludedByDefault { get; set; }
            = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
    }
}
