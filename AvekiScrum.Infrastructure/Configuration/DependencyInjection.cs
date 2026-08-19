using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Infrastructure.AzureDevOps;
using Microsoft.Extensions.DependencyInjection;

namespace AvekiScrum.Infrastructure.Configuration
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddAvekiScrumInfrastructure(this IServiceCollection services, AzureSettings azureSettings)
        {
            AzureUrlHelper.Initialize(azureSettings.Organization, azureSettings.Project);

            services.AddHttpClient<IAzureDevOpsRestClient, AzureDevOpsRestClient>();
            services.AddHttpClient<IImageContentService, ImageContentService>();
            services.AddHttpClient<IPersonImageProvider, PersonImageProvider>();
            services.AddSingleton<IAzureDevOpsConnectionProvider, AzureDevOpsConnectionProvider>();
            services.AddScoped<IAzureDevOpsGitClient, AzureDevOpsGitClient>();
            services.AddScoped<IAzureDevOpsBoardsClient, AzureDevOpsBoardsClient>();
            services.AddScoped<IAzureDevOpsWikiClient, AzureDevOpsWikiClient>();
            services.AddScoped<IAzureDevOpsTeamClient, AzureDevOpsTeamClient>();
            services.AddScoped<IAzureDevOpsTestPlansClient, AzureDevOpsTestPlansClient>();
            services.AddScoped<IAzureDevOpsService, AzureDevOpsService>();
            services.AddSingleton<ITeamRoleProvider, TeamRoleProvider>();

            return services;
        }
    }
}
