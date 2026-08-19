using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public interface IAzureDevOpsTeamClient
    {
        Task<List<TeamMemberDto>> GetTeamMembersAsync(DeveloperTeam team, CancellationToken ct = default);
        Task<IReadOnlyList<AzureDevopsTeamInfo>> ListTeamsAsync(CancellationToken ct = default);
        Task<AzureDevopsTeamInfo?> GetTeamAsync(string teamNameOrId, CancellationToken ct = default);
    }
}
