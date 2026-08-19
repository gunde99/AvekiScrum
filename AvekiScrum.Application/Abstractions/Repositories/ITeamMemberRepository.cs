using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Shared.Enums;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface ITeamMemberRepository
    {
        Task<int> AddAsync(TeamMemberDto entity);
        Task DeleteAsync(int id);
        Task<List<TeamMemberDto>> GetAllAsync(CancellationToken cancellationToken);
        Task<TeamMemberDto> GetByIdAsync(int id);
        Task UpdateAsync(TeamMemberDto entity);
        /// <summary>
        /// Lägg till (eller uppdatera) en hel samling TeamMembers i kontexten.
        /// </summary>
        Task AddRangeAsync(IEnumerable<TeamMemberDto> entities);

        /// <summary>
        /// Persist all pending changes to the database.
        /// </summary>
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

        // specialmetoder för team-sync
        Task<List<TeamMemberDto>> GetByTeamNameAsync(string teamName, bool justDevelopers = true);
        Task DeleteByTeamNameAsync(string teamName);

        //Rollbaserat
        List<string> GetAllTeamMemberNamesForRole(TeamRoleType roleType);
    }
}
