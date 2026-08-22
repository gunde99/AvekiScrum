using Microsoft.Extensions.Options;
using Microsoft.TeamFoundation.Core.WebApi;
using Microsoft.TeamFoundation.Work.WebApi;
using Microsoft.TeamFoundation.WorkItemTracking.WebApi;
using Microsoft.VisualStudio.Services.Common;
using Microsoft.VisualStudio.Services.WebApi;
using System;
using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Configuration;
using Microsoft.VisualStudio.Services.OAuth;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal interface IAzureDevOpsConnectionProvider
    {
        VssConnection Connection { get; }
        string Project { get; }

        WorkItemTrackingHttpClient GetWorkItemTrackingClient();
        WorkHttpClient GetWorkClient();
        TeamHttpClient GetTeamClient();
    }

    internal sealed class AzureDevOpsConnectionProvider : IAzureDevOpsConnectionProvider
    {
        public VssConnection Connection { get; }
        public string Project { get; }

        /// <remarks>
        /// Scoped, not singleton: with delegated auth the connection carries the signed-in user's
        /// token, so it can't be shared across requests. The credential is resolved synchronously
        /// here because VssConnection wants it up front - in Entra mode that's a cache hit on the
        /// token acquired for this request.
        /// </remarks>
        public AzureDevOpsConnectionProvider(
            IOptions<AzureSettings> options,
            IAzureDevOpsCredentialProvider credentials)
        {
            var settings = options.Value;
            var header = credentials.GetAuthHeaderAsync().AsTask().GetAwaiter().GetResult();
            VssCredentials creds = header.Scheme == "Bearer"
                ? new VssOAuthAccessTokenCredential(header.Parameter)
                : new VssBasicCredential(string.Empty, settings.PAT);
            var baseUrl = $"{settings.BaseUrl}/{settings.Organization}";
            Connection = new VssConnection(new Uri(baseUrl), creds);
            Project = settings.Project;
        }

        public WorkItemTrackingHttpClient GetWorkItemTrackingClient()
            => Connection.GetClient<WorkItemTrackingHttpClient>();

        public WorkHttpClient GetWorkClient()
            => Connection.GetClient<WorkHttpClient>();

        public TeamHttpClient GetTeamClient()
            => Connection.GetClient<TeamHttpClient>();
    }
}
