using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Configuration;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    /// <summary>
    /// The original shared-PAT credential, kept for local development and as a way back if the
    /// delegated path has to be turned off in a hurry. Everything it does is attributed to the
    /// token's owner in Azure DevOps, which is exactly why it isn't the production mode any more.
    /// </summary>
    internal sealed class PatCredentialProvider : IAzureDevOpsCredentialProvider
    {
        private readonly string _encodedPat;

        public PatCredentialProvider(IOptions<AzureSettings> options)
        {
            // Azure DevOps takes the PAT as the password half of basic auth, with an empty user.
            _encodedPat = Convert.ToBase64String(Encoding.ASCII.GetBytes($":{options.Value.PAT}"));
        }

        public ValueTask<AuthHeader> GetAuthHeaderAsync(CancellationToken ct = default)
            => ValueTask.FromResult(new AuthHeader("Basic", _encodedPat));
    }
}
