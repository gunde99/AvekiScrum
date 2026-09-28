using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface ITalkingPointRepository
    {
        Task<IReadOnlyList<TalkingPoint>> GetByTeamAsync(DeveloperTeam team, CancellationToken ct = default);

        /// <summary>Creates a new talking point (Id assigned by the repository) and returns it.</summary>
        Task<TalkingPoint> CreateAsync(DeveloperTeam team, TalkingPoint point, CancellationToken ct = default);

        /// <summary>Updates the body/assignee of an existing talking point. Returns null if no
        /// talking point with that id exists for the team.</summary>
        Task<TalkingPoint?> UpdateAsync(DeveloperTeam team, string id, string bodyHtml, string assigneeEmail, string assigneeDisplayName, CancellationToken ct = default);

        /// <summary>Sets Raised (and RaisedAt) on a single talking point. Returns null if it doesn't exist.</summary>
        Task<TalkingPoint?> SetRaisedAsync(DeveloperTeam team, string id, bool raised, CancellationToken ct = default);

        /// <summary>Sets Raised on every talking point for the team at once - the settings page's
        /// "tänd/släck allt" bulk action.</summary>
        Task SetAllRaisedAsync(DeveloperTeam team, bool raised, CancellationToken ct = default);

        /// <summary>Returns true if a talking point with that id existed and was removed.</summary>
        Task<bool> DeleteAsync(DeveloperTeam team, string id, CancellationToken ct = default);
    }
}
