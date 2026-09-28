using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface ITalkingPointRepository
    {
        /// <summary>Everything, any scope - the settings modal's "Alla" filter.</summary>
        Task<IReadOnlyList<TalkingPoint>> GetAllAsync(CancellationToken ct = default);

        /// <summary>Items relevant to one team - Scope is that team or "Both".</summary>
        Task<IReadOnlyList<TalkingPoint>> GetForTeamAsync(DeveloperTeam team, CancellationToken ct = default);

        /// <summary>Creates a new talking point (Id assigned by the repository) and returns it.</summary>
        Task<TalkingPoint> CreateAsync(TalkingPoint point, CancellationToken ct = default);

        /// <summary>Updates the body/assignee/scope of an existing talking point. Returns null if no
        /// talking point with that id exists.</summary>
        Task<TalkingPoint?> UpdateAsync(string id, string bodyHtml, string assigneeEmail, string assigneeDisplayName, string scope, CancellationToken ct = default);

        /// <summary>Sets the raised flag for one team ("Nord"/"Syd"), or both at once ("Both") - the
        /// settings modal's "Alla" filter treats a row as one on/off switch that marks it done (or
        /// not) everywhere it's relevant. Returns null if it doesn't exist.</summary>
        Task<TalkingPoint?> SetRaisedAsync(string id, string team, bool raised, CancellationToken ct = default);

        /// <summary>The settings page's "tänd/släck allt" bulk action, scoped the same way as the
        /// list it was clicked from: "Nord"/"Syd" only touches items relevant to that team's own
        /// raised flag, "Both" touches every item's flags for both teams.</summary>
        Task SetAllRaisedAsync(string teamFilter, bool raised, CancellationToken ct = default);

        /// <summary>Returns true if a talking point with that id existed and was removed.</summary>
        Task<bool> DeleteAsync(string id, CancellationToken ct = default);
    }
}
