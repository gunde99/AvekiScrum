using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    /// <summary>
    /// Puts the Azure DevOps credential on every outgoing request.
    /// </summary>
    /// <remarks>
    /// A handler rather than a header set in each client's constructor: with delegated auth the
    /// credential belongs to the signed-in user and can be refreshed mid-session, so it has to be
    /// resolved per request. Doing it here means none of the clients need to know which mode the
    /// app is running in.
    /// </remarks>
    internal sealed class AzureDevOpsAuthHandler : DelegatingHandler
    {
        private readonly IAzureDevOpsCredentialProvider _credentials;

        public AzureDevOpsAuthHandler(IAzureDevOpsCredentialProvider credentials)
        {
            _credentials = credentials;
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var header = await _credentials.GetAuthHeaderAsync(cancellationToken).ConfigureAwait(false);
            request.Headers.Authorization = new AuthenticationHeaderValue(header.Scheme, header.Parameter);
            return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
    }
}
