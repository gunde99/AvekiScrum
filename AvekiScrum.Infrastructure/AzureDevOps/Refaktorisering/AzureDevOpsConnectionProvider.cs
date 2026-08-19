using Microsoft.Extensions.Options;
using Microsoft.TeamFoundation.Core.WebApi;
using Microsoft.TeamFoundation.Work.WebApi;
using Microsoft.TeamFoundation.WorkItemTracking.WebApi;
using Microsoft.VisualStudio.Services.Common;
using Microsoft.VisualStudio.Services.WebApi;
using System;
using AvekiScrum.Application.Configuration;

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

        public AzureDevOpsConnectionProvider(IOptions<AzureSettings> options)
        {
            var settings = options.Value;
            var creds = new VssBasicCredential(string.Empty, settings.PAT);
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
