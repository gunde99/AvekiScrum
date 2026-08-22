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

            // The handler puts the credential on every outgoing request. It has to be transient:
            // it depends on the scoped credential provider, and a longer-lived handler would
            // capture one user's token and hand it to the next request.
            services.AddTransient<AzureDevOpsAuthHandler>();
            services.AddHttpClient<IAzureDevOpsRestClient, AzureDevOpsRestClient>()
                .AddHttpMessageHandler<AzureDevOpsAuthHandler>();
            services.AddHttpClient<IImageContentService, ImageContentService>()
                .AddHttpMessageHandler<AzureDevOpsAuthHandler>();
            services.AddHttpClient<IPersonImageProvider, PersonImageProvider>()
                .AddHttpMessageHandler<AzureDevOpsAuthHandler>();
            // Scoped rather than singleton now that the connection can carry a per-user token.
            services.AddScoped<IAzureDevOpsConnectionProvider, AzureDevOpsConnectionProvider>();
            services.AddScoped<IAzureDevOpsGitClient, AzureDevOpsGitClient>();
            services.AddScoped<IAzureDevOpsBoardsClient, AzureDevOpsBoardsClient>();
            services.AddScoped<IAzureDevOpsWikiClient, AzureDevOpsWikiClient>();
            services.AddScoped<IAzureDevOpsTeamClient, AzureDevOpsTeamClient>();
            services.AddScoped<IAzureDevOpsTestPlansClient, AzureDevOpsTestPlansClient>();
            services.AddScoped<IAzureDevOpsService, AzureDevOpsService>();
            services.AddSingleton<ITeamRoleProvider, TeamRoleProvider>();

            // Default credential. AvekiScrum.Api replaces this with the delegated one when
            // Auth:Mode is "Entra".
            services.AddScoped<IAzureDevOpsCredentialProvider, PatCredentialProvider>();

            return services;
        }
    }
}
