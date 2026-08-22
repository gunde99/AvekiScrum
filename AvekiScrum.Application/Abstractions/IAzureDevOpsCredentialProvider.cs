using System.Threading;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Abstractions
{
    /// <summary>
    /// Supplies the credential every call to Azure DevOps is made with.
    /// </summary>
    /// <remarks>
    /// Two implementations exist, chosen by Auth:Mode:
    ///
    /// - PAT: one shared token, the same for everyone. Simple, but Azure records every change as
    ///   made by whoever owns the token, so a card never says who really wrote it.
    /// - Entra: the signed-in user's own token, obtained on-behalf-of. Cards get the right name,
    ///   and each person sees exactly what they are allowed to see.
    ///
    /// Because the Entra credential belongs to the current request, everything downstream of this
    /// has to be scoped rather than singleton, and the header has to be set per request instead of
    /// once when an HttpClient is built.
    /// </remarks>
    public interface IAzureDevOpsCredentialProvider
    {
        /// <summary>"Basic" with the PAT, or "Bearer" with the user's delegated token.</summary>
        ValueTask<AuthHeader> GetAuthHeaderAsync(CancellationToken ct = default);
    }

    /// <param name="Scheme">"Basic" or "Bearer".</param>
    /// <param name="Parameter">The encoded PAT, or the access token.</param>
    public readonly record struct AuthHeader(string Scheme, string Parameter);
}
