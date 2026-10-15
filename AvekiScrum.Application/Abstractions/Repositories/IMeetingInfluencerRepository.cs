using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface IMeetingInfluencerRepository
    {
        /// <summary>Every draw ever made, any date - the lottery's fair-rotation history.</summary>
        Task<IReadOnlyList<MeetingInfluencer>> GetAllAsync(CancellationToken ct = default);

        /// <summary>The influencers presenting at one meeting ("yyyy-MM-dd").</summary>
        Task<IReadOnlyList<MeetingInfluencer>> GetForDateAsync(string meetingDate, CancellationToken ct = default);

        /// <summary>Adds a drawn person (Id assigned by the repository). Drawing the same person
        /// twice for the same date returns the existing entry instead of a duplicate.</summary>
        Task<MeetingInfluencer> AddAsync(MeetingInfluencer influencer, CancellationToken ct = default);

        /// <summary>The panel's "ångra" - returns true if an entry with that id existed and was removed.</summary>
        Task<bool> DeleteAsync(string id, CancellationToken ct = default);
    }
}
