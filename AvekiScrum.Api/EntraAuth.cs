using System.Security.Claims;
using AvekiScrum.Application.Abstractions;
using Microsoft.Identity.Web;

namespace AvekiScrum.Api;

/// <summary>
/// Delegated access to Azure DevOps: the signed-in user's token for this API is exchanged
/// on-behalf-of for one that Azure DevOps accepts, so every card records the person who actually
/// made the change instead of whoever owned a shared PAT.
/// </summary>
internal sealed class EntraCredentialProvider : IAzureDevOpsCredentialProvider
{
    /// <summary>
    /// Azure DevOps' resource id, and the scopes this app actually needs. Deliberately not
    /// user_impersonation - that grants everything in the REST API, which is the broad access we
    /// left behind with the PAT.
    /// </summary>
    public static readonly string[] AzureDevOpsScopes =
    {
        "499b84ac-1321-427f-aa17-267ca6975798/vso.work_full",
        "499b84ac-1321-427f-aa17-267ca6975798/vso.project",
        "499b84ac-1321-427f-aa17-267ca6975798/vso.wiki",
        "499b84ac-1321-427f-aa17-267ca6975798/vso.code",
        "499b84ac-1321-427f-aa17-267ca6975798/vso.identity",
        "499b84ac-1321-427f-aa17-267ca6975798/vso.profile",
    };

    private readonly ITokenAcquisition _tokenAcquisition;

    public EntraCredentialProvider(ITokenAcquisition tokenAcquisition)
    {
        _tokenAcquisition = tokenAcquisition;
    }

    public async ValueTask<AuthHeader> GetAuthHeaderAsync(CancellationToken ct = default)
    {
        // Cached per user by Microsoft.Identity.Web, so this is a lookup rather than a round trip
        // on all but the first call of a session.
        var token = await _tokenAcquisition.GetAccessTokenForUserAsync(AzureDevOpsScopes);
        return new AuthHeader("Bearer", token);
    }
}

/// <summary>Who the caller is, and which configured colleague they match.</summary>
internal sealed record SignedInUser(
    string DisplayName,
    string? Email,
    string? ObjectId,
    /// <summary>The email from TeamRoleConfig this person matches, when they're in it.</summary>
    string? MatchedEmail,
    /// <summary>The role groups they belong to - "DevelopersTeamSyd" and so on.</summary>
    IReadOnlyList<string> RoleGroups);

internal static class SignedInUserReader
{
    /// <summary>
    /// Reads the identity out of the validated token and lines it up with TeamRoleConfig.
    ///
    /// The match is on the UPN/email, falling back to the display name, because the config was
    /// written with Azure DevOps logins in mind and those are the same addresses. A user who
    /// doesn't match is still signed in - they just don't belong to a team, which is exactly the
    /// case for the support staff this tool was built for.
    /// </summary>
    public static SignedInUser Read(ClaimsPrincipal principal, IDictionary<string, List<string>>? roleMapping)
    {
        var email =
            principal.FindFirstValue("preferred_username")
            ?? principal.FindFirstValue(ClaimTypes.Upn)
            ?? principal.FindFirstValue(ClaimTypes.Email);
        var displayName =
            principal.FindFirstValue("name")
            ?? principal.FindFirstValue(ClaimTypes.Name)
            ?? email
            ?? "Okänd användare";
        var objectId = principal.FindFirstValue("oid") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

        string? matched = null;
        var groups = new List<string>();
        foreach (var (groupName, members) in roleMapping ?? new Dictionary<string, List<string>>())
        {
            foreach (var member in members ?? new List<string>())
            {
                var isMatch =
                    (!string.IsNullOrWhiteSpace(email) && string.Equals(member, email, StringComparison.OrdinalIgnoreCase))
                    || string.Equals(PersonNames.Format(member), displayName, StringComparison.OrdinalIgnoreCase);
                if (!isMatch) continue;
                matched ??= member;
                groups.Add(groupName);
                break;
            }
        }

        return new SignedInUser(displayName, email, objectId, matched, groups);
    }
}

/// <summary>
/// Turns the Entra error codes we actually hit into the one action that fixes them.
///
/// AADSTS codes say what happened but never what to do about it, and the difference between "the
/// SPA lacks consent" and "the Api lacks consent" is one number nobody remembers. Written in
/// Swedish because these end up in front of whoever is setting the server up, not in a log.
/// </summary>
internal static class AuthErrorHints
{
    public static string? For(string? message, IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(message)) return null;

        var tenant = configuration["Auth:TenantId"];
        var apiClientId = configuration["Auth:ClientId"];

        if (message.Contains("AADSTS65001", StringComparison.Ordinal))
        {
            return "Admin consent saknas för API-appen mot Azure DevOps. Gå till Entra → App " +
                   "registrations → AvekiScrum API → API permissions och klicka 'Grant admin consent'. " +
                   "Varje vso.*-rad ska sedan visa grön bock. Genväg: " +
                   $"https://login.microsoftonline.com/{tenant}/adminconsent?client_id={apiClientId}";
        }

        if (message.Contains("AADSTS7000215", StringComparison.Ordinal))
        {
            return "Klienthemligheten stämmer inte eller har gått ut. Sätt Auth__ClientSecret på " +
                   "maskinnivå och starta om W3SVC - app poolen läser miljövariabler vid start.";
        }

        if (message.Contains("AADSTS50013", StringComparison.Ordinal)
            || message.Contains("AADSTS500011", StringComparison.Ordinal))
        {
            return "Azure DevOps kände inte igen resursen som efterfrågades. Kontrollera att " +
                   "vso.*-behörigheterna ligger på API-appen och inte på SPA:n.";
        }

        return null;
    }
}
