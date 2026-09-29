using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    /// <summary>
    /// The sprint-goals wiki page changes every sprint (a new page gets created each time) - this
    /// lets it be repointed from inside the app instead of editing appsettings.json and restarting
    /// the Api. Null/no override falls back to the configured default (PlanningBoard:
    /// SprintGoalsWikiUrls:{team} in appsettings.json) - see AzureDevOpsService.GetSprintGoalsAsync.
    /// </summary>
    public interface ISprintGoalsWikiUrlStore
    {
        Task<string?> GetOverrideAsync(DeveloperTeam team, CancellationToken ct = default);

        Task SetOverrideAsync(DeveloperTeam team, string wikiUrl, CancellationToken ct = default);
    }
}
