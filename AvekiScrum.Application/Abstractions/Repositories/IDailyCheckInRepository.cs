using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface IDailyCheckInRepository
    {
        /// <summary>
        /// Saves every entry, replacing (not duplicating) whatever was already stored for the same
        /// Team+SprintPath+Date+Kind+Key. A repeated save for the same calendar day - a practice
        /// run of the daily flow before the real one, say - overwrites that day's numbers instead
        /// of piling up a second copy alongside them.
        /// </summary>
        Task UpsertAsync(IReadOnlyList<DailyCheckIn> entries, CancellationToken ct = default);

        Task<IReadOnlyList<DailyCheckIn>> GetByTeamAsync(DeveloperTeam team, CancellationToken ct = default);
    }
}
