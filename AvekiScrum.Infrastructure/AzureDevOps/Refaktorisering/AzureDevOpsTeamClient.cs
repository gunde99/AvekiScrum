// Infrastructure/AzureDevOps/AzureDevOpsTeamClient.cs
using Microsoft.Extensions.Logging;
using Microsoft.TeamFoundation.Core.WebApi;
using Microsoft.VisualStudio.Services.WebApi;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Application.Models.DTOs.Developer;
using System.Linq;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal sealed class AzureDevOpsTeamClient : IAzureDevOpsTeamClient
    {
        private readonly IAzureDevOpsConnectionProvider _conn;
        private readonly ILogger<AzureDevOpsTeamClient> _logger;

        private string Project => _conn.Project;

        public AzureDevOpsTeamClient(
            IAzureDevOpsConnectionProvider conn,
            ILogger<AzureDevOpsTeamClient> logger)
        {
            _conn = conn;
            _logger = logger;
        }

        public async Task<List<TeamMemberDto>> GetTeamMembersAsync(
            DeveloperTeam team,
            CancellationToken ct = default)
        {
            var meta = team.GetMetadata();
            var teamClient = _conn.GetTeamClient();

            var vssTeam = await teamClient.GetTeamAsync(Project, meta.AzureDevOpsName, userState: null, cancellationToken: ct);
            var members = await teamClient.GetTeamMembersWithExtendedPropertiesAsync(Project, vssTeam.Id.ToString(), cancellationToken: ct);

            return members.Select(m => new TeamMemberDto
            {
                AzureId = m.Identity.Id,
                DisplayName = m.Identity.DisplayName ?? m.Identity.UniqueName ?? "Unknown",
                UniqueName = m.Identity.UniqueName ?? string.Empty
            }).ToList();
        }

        public async Task<IReadOnlyList<AzureDevopsTeamInfo>> ListTeamsAsync(CancellationToken ct = default)
        {
            var teamClient = _conn.GetTeamClient();
            var teams = await teamClient.GetTeamsAsync(Project, top: 200, skip: 0, expandIdentity: true, cancellationToken: ct);

            return teams.Select(t => new AzureDevopsTeamInfo
            {
                Id = t.Id.ToString(),
                Name = t.Name,
                Description = t.Description,
                ProjectName = t.ProjectName
            }).ToList();
        }

        public async Task<AzureDevopsTeamInfo?> GetTeamAsync(string teamNameOrId, CancellationToken ct = default)
        {
            var teamClient = _conn.GetTeamClient();
            try
            {
                var team = await teamClient.GetTeamAsync(Project, teamNameOrId, cancellationToken: ct);

                return new AzureDevopsTeamInfo
                {
                    Id = team.Id.ToString(),
                    Name = team.Name,
                    Description = team.Description,
                    ProjectName = team.ProjectName
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get team {Team}", teamNameOrId);
                return null;
            }
        }
    }
}
