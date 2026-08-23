using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Boards.Dailys;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps;
using AvekiScrum.Infrastructure.Configuration;
using AvekiScrum.Api;
using AvekiScrum.Shared.Enums;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;

var builder = WebApplication.CreateBuilder(args);

// appsettings.json + environment variables (same convention as WorkOrganizer: set
// AzureDevOps__PAT as a User environment variable). No Aveki ID / OIDC auth yet -
// this Api is unauthenticated and trusts whoever can reach it. That is intentional
// for now (see AvekiScrum/docs/SCRUM_WEB_APP_SPEC.md §6/§9) and must not ship beyond
// local development until Aveki ID sign-in replaces this PAT-based fallback.
// Local testing override: lets a developer point the whole Api at a sandbox Azure DevOps
// project (e.g. "ScrumLab") without touching the real AzureDevOps:Project value. Empty/unset
// falls back to the normal AzureDevOps:Project ("Utveckling"). Applied directly on the
// configuration source (an in-memory overlay) before anything binds AzureSettings, so every
// consumer - the static AzureUrlHelper.Initialize call below and any IOptions<AzureSettings> -
// agrees on the same effective project.
var projectOverride = builder.Configuration["Testing:ProjectOverride"];
// Kept before the override is applied, so the startup log can name what clearing it would give you.
var configuredProject = builder.Configuration["AzureDevOps:Project"];
if (!string.IsNullOrWhiteSpace(projectOverride))
{
    builder.Configuration["AzureDevOps:Project"] = projectOverride;
}

var azureSettings = builder.Configuration.GetSection("AzureDevOps").Get<AzureSettings>()
    ?? throw new InvalidOperationException("Missing 'AzureDevOps' configuration section.");
builder.Services.Configure<AzureSettings>(builder.Configuration.GetSection("AzureDevOps"));
builder.Services.Configure<TeamRoleConfig>(builder.Configuration.GetSection("TeamRoleConfig"));
builder.Services.Configure<DailyFlowConfig>(builder.Configuration.GetSection("DailyFlow"));
// Plain outbound client for the Teams webhook - no Azure DevOps auth on this one.
builder.Services.AddHttpClient();

builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(AzureDevOpsService).Assembly));

builder.Services.AddAvekiScrumInfrastructure(azureSettings);
builder.Services.AddScoped<DailyDashboardDataBuilder>();

// Auth:Mode decides two separate things: whether users must sign in, and who Azure DevOps thinks
// is calling. They're separate because the second one needs an administrator's consent, and that
// can take days to arrange - waiting for it shouldn't mean waiting to use the tool.
//
//   "Entra"        - sign-in required, Azure DevOps called as the signed-in user via on-behalf-of.
//                    Cards record the real person. The destination.
//   "EntraWithPat" - sign-in required, but Azure DevOps still called with the shared PAT. Everything
//                    the sign-in gives (a closed Api, the right name on the Buggrapportör line, no
//                    typing your own name) except the attribution in Azure's own history, which
//                    needs the delegated consent. Meant for the wait, not for good.
//   "Pat"          - no sign-in at all. Local development.
var authMode = builder.Configuration["Auth:Mode"] ?? "Pat";
// Refused rather than guessed at. A value that matches nothing used to fall through to "Pat",
// which is the one mode that leaves the Api open to anonymous callers - so a typo, or a stray
// translation of the word, silently turned sign-in off. This has happened once already.
if (!new[] { "Entra", "EntraWithPat", "Pat" }.Contains(authMode, StringComparer.OrdinalIgnoreCase))
{
    throw new InvalidOperationException(
        $"Auth:Mode är \"{authMode}\", vilket inte är ett giltigt läge. Använd \"Entra\", " +
        "\"EntraWithPat\" eller \"Pat\" - se docs/DEPLOY_IIS.md.");
}
var requireSignIn = authMode.StartsWith("Entra", StringComparison.OrdinalIgnoreCase);
var delegatedAzureDevOps = string.Equals(authMode, "Entra", StringComparison.OrdinalIgnoreCase);
var entraMode = requireSignIn;
if (entraMode)
{
    // Microsoft.Identity.Web reads the secret from Auth:ClientSecret. The deploy notes originally
    // said Auth__ApiClientSecret, which is a name nothing looks at - accepted here as an alias so
    // an already-configured server doesn't have to be touched.
    var aliasSecret = builder.Configuration["Auth:ApiClientSecret"];
    if (!string.IsNullOrWhiteSpace(aliasSecret) && string.IsNullOrWhiteSpace(builder.Configuration["Auth:ClientSecret"]))
    {
        builder.Configuration["Auth:ClientSecret"] = aliasSecret;
    }

    builder.Services
        .AddAuthentication(Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme)
        .AddMicrosoftIdentityWebApi(
            jwtOptions =>
            {
                // A 401 from token validation says nothing in the browser - the reason lives in an
                // exception the middleware swallows. Logged here, so the app log names the actual
                // mismatch (audience, issuer, expiry) instead of leaving it to guesswork.
                jwtOptions.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        context.HttpContext.RequestServices
                            .GetRequiredService<ILoggerFactory>()
                            .CreateLogger("AvekiScrum.Auth")
                            .LogError(context.Exception,
                                "Token validation failed for {Path}. Expected issuer {Issuer}, audience {ClientId}.",
                                context.Request.Path,
                                $"https://login.microsoftonline.com/{builder.Configuration["Auth:TenantId"]}/v2.0",
                                builder.Configuration["Auth:ClientId"]);
                        return Task.CompletedTask;
                    },
                };
            },
            identityOptions => builder.Configuration.GetSection("Auth").Bind(identityOptions))
        // No initial scopes here - the Azure DevOps scopes are asked for per call in
        // EntraCredentialProvider, which keeps the list in one place next to the code that uses it.
        .EnableTokenAcquisitionToCallDownstreamApi(_ => { })
        // In-memory is right for a single IIS server: a restart costs everyone one silent token
        // refresh, which they won't notice. Swap for a distributed cache if this is ever load
        // balanced.
        .AddInMemoryTokenCaches();

    builder.Services.AddAuthorization(options =>
    {
        // Every endpoint requires a signed-in user unless it opts out. Safer than remembering to
        // add RequireAuthorization to each new endpoint.
        options.FallbackPolicy = options.DefaultPolicy;
    });

    if (delegatedAzureDevOps)
    {
        builder.Services.AddScoped<IAzureDevOpsCredentialProvider, EntraCredentialProvider>();
    }
    // In EntraWithPat the PAT provider registered by AddAvekiScrumInfrastructure stays in place.
}

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    // Permissive local-dev CORS so a future React client (any localhost port) can call
    // this Api during development. Tighten before this ever leaves a dev machine.
    options.AddDefaultPolicy(policy => policy
        .SetIsOriginAllowed(origin => origin.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase)
            || origin.StartsWith("https://localhost", StringComparison.OrdinalIgnoreCase))
        .AllowAnyHeader()
        .AllowAnyMethod());
});

var app = builder.Build();

// First line in the console window, because it is the one that decides what everything else means.
// appsettings is read at startup only, so an Api left running from before an edit keeps serving the
// old project - and the sandbox is a copy of the real one, so the boards give nothing away.
if (string.IsNullOrWhiteSpace(projectOverride))
{
    app.Logger.LogInformation("Azure DevOps-projekt: {Project} (skarpt).", configuredProject);
}
else
{
    app.Logger.LogWarning(
        "Azure DevOps-projekt: {Project} - SANDLÅDA via Testing:ProjectOverride. Töm den och starta " +
        "om för att köra mot {Real}.",
        projectOverride,
        configuredProject);
}

if (entraMode)
{
    // Fail loudly at startup rather than with a 500 on the first token exchange. A missing secret
    // is the single most likely thing to be wrong on a fresh server, and the error it causes
    // otherwise ("AADSTS7000215") names neither the setting nor the app.
    if (string.IsNullOrWhiteSpace(builder.Configuration["Auth:ClientSecret"]))
    {
        app.Logger.LogError(
            "Auth:Mode is \"Entra\" but no client secret is configured. Set the Auth__ClientSecret " +
            "environment variable at Machine level and restart W3SVC - the app pool reads " +
            "environment variables at start.");
    }
    app.Logger.LogInformation(
        "Auth mode: {Mode}. Tenant {Tenant}, client {ClientId}. Azure DevOps is called {As}.",
        authMode,
        builder.Configuration["Auth:TenantId"],
        builder.Configuration["Auth:ClientId"],
        delegatedAzureDevOps ? "as the signed-in user" : "with the shared PAT");

    if (!delegatedAzureDevOps)
    {
        app.Logger.LogWarning(
            "Auth:Mode is \"EntraWithPat\": users sign in, but changes in Azure DevOps are still " +
            "recorded as the PAT owner. Switch to \"Entra\" once an administrator has granted " +
            "consent for the Api's Azure DevOps permissions.");
    }
}
else
{
    var patValue = builder.Configuration["AzureDevOps:PAT"];
    if (string.IsNullOrWhiteSpace(patValue))
    {
        app.Logger.LogWarning(
            "AzureDevOps:PAT is not set. Set the AzureDevOps__PAT environment variable " +
            "(same one WorkOrganizer uses) before calling any /api endpoint.");
    }
    app.Logger.LogWarning(
        "Auth mode: Pat. The Api is open to anonymous callers and every change in Azure DevOps " +
        "is recorded as the token owner. Intended for local development only.");
}

// Unhandled exceptions come back as JSON with the reason in it, not a bare 500.
//
// On a server where finding the log is its own project, "HTTP 500" in the browser is a dead end -
// the message and exception type almost always name the problem. This is an intranet tool behind
// sign-in, so the trade against leaking internals is an easy one; the stack trace still only goes
// to the log.
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("AvekiScrum.Unhandled");
        logger.LogError(ex, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);

        if (context.Response.HasStarted) throw;
        context.Response.Clear();
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new
        {
            error = ex.Message,
            type = ex.GetType().Name,
            // MSAL nests the real reason one level down often enough to be worth surfacing.
            inner = ex.InnerException?.Message,
            hint = AuthErrorHints.For($"{ex.Message} {ex.InnerException?.Message}", builder.Configuration),
            path = context.Request.Path.Value,
        });
    }
});

// A plain, unauthenticated answer to "is the app running at all". The first thing to check when
// the browser shows nothing: this answers even when sign-in is misconfigured.
app.MapGet("/api/health", (IConfiguration configuration) => Results.Ok(new
{
    status = "ok",
    // Which Azure DevOps project this instance is actually talking to. Configuration is read once
    // at startup, so an Api left running from before an appsettings edit keeps serving the old
    // project - and nothing on screen said so. Now it does.
    project = configuration["AzureDevOps:Project"],
    sandbox = !string.IsNullOrWhiteSpace(projectOverride),
    authMode = configuration["Auth:Mode"],
    // Says outright which of the two things sign-in buys you are actually on.
    signInRequired = requireSignIn,
    azureDevOpsAs = delegatedAzureDevOps ? "inloggad användare" : "delad PAT",
    hasClientSecret = !string.IsNullOrWhiteSpace(configuration["Auth:ClientSecret"]),
    environment = app.Environment.EnvironmentName,
}))
.AllowAnonymous()
.WithName("GetHealth");

// The deep check: does the signed-in user's token actually get us into Azure DevOps?
//
// This is the step between "you are signed in" and "the boards work", and the one that fails
// quietly. Rather than a 500 somewhere inside a board, this does the two things that can go wrong
// - the on-behalf-of exchange, and the first call to Azure DevOps - and reports each in words.
app.MapGet("/api/health/azure", async (
    IAzureDevOpsCredentialProvider credentials,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    string tokenStep;
    try
    {
        var header = await credentials.GetAuthHeaderAsync(ct);
        tokenStep = $"ok ({header.Scheme}, {header.Parameter.Length} tecken)";
    }
    catch (Exception ex)
    {
        return Results.Ok(new
        {
            token = "MISSLYCKADES",
            reason = ex.Message,
            type = ex.GetType().Name,
            inner = ex.InnerException?.Message,
            hint = AuthErrorHints.For($"{ex.Message} {ex.InnerException?.Message}", configuration)
                   ?? "Växlingen on-behalf-of mot Azure DevOps gick inte. Kontrollera att API-appen har " +
                      "de delegerade vso.*-behörigheterna och att admin consent är givet.",
        });
    }

    try
    {
        // Cheapest real call there is: reading the area paths touches the same auth path as
        // everything else without depending on a team, a sprint or a board.
        var areas = await azureDevOpsService.GetClassificationPathsAsync(areas: true, ct);
        return Results.Ok(new { token = tokenStep, azureDevOps = "ok", areaPaths = areas.Count });
    }
    catch (Exception ex)
    {
        return Results.Ok(new
        {
            token = tokenStep,
            azureDevOps = "MISSLYCKADES",
            reason = ex.Message,
            type = ex.GetType().Name,
            hint = "Token hämtades men Azure DevOps avvisade den. Vanligast: användaren saknar " +
                   "behörighet i organisationen, eller något vso.*-scope saknas på API-appen.",
        });
    }
})
.WithName("GetAzureHealth");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

// The built React client is copied into wwwroot when publishing, so IIS serves both halves from
// one site. Same origin means no CORS in production and no second host name to certificate.
app.UseDefaultFiles();
app.UseStaticFiles();

if (entraMode)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// Who the caller is, and which colleague in TeamRoleConfig they line up with. The client asks
// once at startup and uses the answer as the reporter identity - no more typing your own name.
app.MapGet("/api/me", (HttpContext http, IOptions<TeamRoleConfig> teamRoles, IConfiguration configuration) =>
{
    // Answered whether or not anyone is signed in: "which project am I looking at" is a question
    // about the server, not about the caller, and getting it wrong is expensive in both directions
    // - editing a real card thinking it's the sandbox, or the reverse.
    var project = configuration["AzureDevOps:Project"];
    var sandbox = !string.IsNullOrWhiteSpace(projectOverride);

    // Asked of the request, not of the configured mode. Both Entra modes sign the user in - only
    // the *Azure DevOps* half differs between them - and keying this off Auth:Mode == "Entra" is
    // what left EntraWithPat users looking anonymous to their own app, name and photo included.
    if (http.User?.Identity?.IsAuthenticated != true)
    {
        // PAT mode has no signed-in user. Saying so plainly lets the client fall back to asking
        // for a name rather than guessing that auth is broken.
        return Results.Ok(new { signedIn = false, project, sandbox });
    }

    var user = SignedInUserReader.Read(http.User, teamRoles.Value.TeamRoleMapping);
    return Results.Ok(new
    {
        signedIn = true,
        displayName = user.DisplayName,
        email = user.Email,
        objectId = user.ObjectId,
        matchedEmail = user.MatchedEmail,
        roleGroups = user.RoleGroups,
        // Which half of the organisation they support, for the defaults that differ between them.
        team = SupportBugs.TeamFor(user.RoleGroups),
        project,
        sandbox,
    });
})
.WithName("GetSignedInUser");

app.MapGet("/api/dailys", async (
    string team,
    IAzureDevOpsService azureDevOpsService,
    ITeamRoleProvider teamRoleProvider,
    DailyDashboardDataBuilder builder,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var iterations = await azureDevOpsService.GetIterationsAsync(developerTeam, ct);

    // Local testing override: pin the board to a specific iteration instead of the
    // date-based "current sprint" pick, useful in a sandbox project whose sprint dates
    // don't line up with today. Empty/unset falls back to the normal auto-detection.
    var iterationOverride = configuration["Testing:IterationPathOverride"];
    Sprint? selectedSprint;
    if (!string.IsNullOrWhiteSpace(iterationOverride))
    {
        selectedSprint = iterations.FirstOrDefault(
            sprint => string.Equals(sprint.Path, iterationOverride, StringComparison.OrdinalIgnoreCase));
        if (selectedSprint is null)
            return Results.NotFound(
                $"Configured Testing:IterationPathOverride '{iterationOverride}' was not found among team '{team}''s iterations.");
    }
    else
    {
        var today = DateTime.UtcNow.Date;
        selectedSprint =
            iterations.FirstOrDefault(sprint => sprint.StartDate.Date <= today && today <= sprint.EndDate.Date)
            ?? iterations.OrderBy(sprint => sprint.EndDate).FirstOrDefault(sprint => sprint.EndDate.Date >= today)
            ?? iterations.LastOrDefault();
    }

    if (selectedSprint is null)
        return Results.NotFound($"No iterations found for team '{team}'.");

    var workItems = await azureDevOpsService.GetAllWorkItemsWithDetailsAsync(selectedSprint.Path, developerTeam, ct);

    // Area paths are shared across teams (POs plan together there), but a daily should only
    // show cards owned by this team's own developers - not colleagues from the other team who
    // happen to have a card filed under a shared area path. Unassigned cards stay visible since
    // they can't be attributed to either team yet.
    // Only story/bug cards are checked against this list - a Task always stays with its parent
    // story regardless of who it's assigned to, otherwise tasks handed off to a QA engineer (who
    // isn't in the Developers role group) silently vanish from an otherwise-included story.
    var teamDeveloperEmails = new HashSet<string>(
        teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.Developers, $"Team{developerTeam}"),
        StringComparer.OrdinalIgnoreCase);

    // Cards owned by the team's own PO don't belong on the developer-focused board either, but
    // the daily-flow's PO turn still needs them - so they're kept (marked via
    // ownedByProductOwner) instead of dropped outright, and the client hides them from the normal
    // board view.
    var teamProductOwnerEmails = new HashSet<string>(
        teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.ProductOwners, $"Team{developerTeam}"),
        StringComparer.OrdinalIgnoreCase);

    // The Assigned Team field is the one place someone states outright which team owns a card, so
    // when it is set it decides - over the assignee, and over an unassigned card's habit of
    // showing up on both boards. It's rarely filled in, which is exactly why it matters when it is.
    // Returns null when the field is empty or holds something that isn't a team name.
    static DeveloperTeam? ExplicitTeam(AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto wi) =>
        string.IsNullOrWhiteSpace(wi.AssignedTeam) ? null : DeveloperTeamExtensions.FromAzureDevOpsName(wi.AssignedTeam.Trim());

    bool IsOwnedByTeam(AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto wi)
    {
        var explicitTeam = ExplicitTeam(wi);
        if (explicitTeam.HasValue)
            return explicitTeam.Value == developerTeam;
        return string.IsNullOrWhiteSpace(wi.AssignedToEmail) || teamDeveloperEmails.Contains(wi.AssignedToEmail);
    }

    bool IsOwnedByProductOwner(AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto wi)
    {
        if (string.IsNullOrWhiteSpace(wi.AssignedToEmail) || !teamProductOwnerEmails.Contains(wi.AssignedToEmail))
            return false;
        var explicitTeam = ExplicitTeam(wi);
        return !explicitTeam.HasValue || explicitTeam.Value == developerTeam;
    }

    List<AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto> scopedWorkItems;
    HashSet<int> productOwnerStoryIds;
    if (teamDeveloperEmails.Count == 0 && teamProductOwnerEmails.Count == 0)
    {
        scopedWorkItems = workItems.ToList();
        productOwnerStoryIds = new HashSet<int>();
    }
    else
    {
        var developerOwnedStoryIds = workItems
            .Where(wi => wi.TypeEnum != WorkItemType.Task && IsOwnedByTeam(wi))
            .Select(wi => wi.Id)
            .ToHashSet();
        productOwnerStoryIds = workItems
            .Where(wi => wi.TypeEnum != WorkItemType.Task && IsOwnedByProductOwner(wi))
            .Select(wi => wi.Id)
            .ToHashSet();
        var visibleStoryIds = developerOwnedStoryIds.Union(productOwnerStoryIds).ToHashSet();
        scopedWorkItems = workItems
            .Where(wi => wi.TypeEnum == WorkItemType.Task
                ? wi.ParentId.HasValue && visibleStoryIds.Contains(wi.ParentId.Value)
                : visibleStoryIds.Contains(wi.Id))
            .ToList();
    }

    var backlogByTeam = new Dictionary<DeveloperTeam, IReadOnlyList<AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto>>
    {
        [developerTeam] = scopedWorkItems
    };

    var json = await builder.BuildJsonAsync(selectedSprint, backlogByTeam, productOwnerStoryIds);
    return Results.Content(json, "application/json");
})
.WithName("GetDailys");

app.MapGet("/api/sprint-goals", async (
    string team,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var goals = await azureDevOpsService.GetSprintGoalsAsync(developerTeam, ct);
    return Results.Ok(goals);
})
.WithName("GetSprintGoals");

app.MapGet("/api/team-members", (
    string team,
    ITeamRoleProvider teamRoleProvider) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var developers = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.Developers, $"Team{developerTeam}");
    var productOwners = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.ProductOwners, $"Team{developerTeam}");
    var people = developers.Concat(productOwners)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Select(email => new PersonOption(email, FormatDisplayName(email)))
        .OrderBy(p => p.DisplayName)
        .ToList();
    return Results.Ok(people);
})
.WithName("GetTeamMembers");

app.MapGet("/api/team-roles", (
    string team,
    ITeamRoleProvider teamRoleProvider,
    IOptions<DailyFlowConfig> dailyFlowOptions) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var po = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.ProductOwners, $"Team{developerTeam}").FirstOrDefault();
    var testLead = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.QAEngineers, $"Team{developerTeam}").FirstOrDefault();
    var developers = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.Developers, $"Team{developerTeam}")
        .Select(email => new PersonOption(email, FormatDisplayName(email)))
        .OrderBy(p => p.DisplayName)
        .ToList();

    // Seeds the daily-flow participant picker the first time this browser opens the team; after
    // that the saved selection wins, so this is a starting point rather than a hard exclusion.
    dailyFlowOptions.Value.ExcludedByDefault.TryGetValue($"Team{developerTeam}", out var excluded);
    var flowExcludedByDefault = (excluded ?? new List<string>())
        .Select(email => new PersonOption(email, FormatDisplayName(email)))
        .ToList();

    return Results.Ok(new
    {
        po = po is null ? null : new PersonOption(po, FormatDisplayName(po)),
        testLead = testLead is null ? null : new PersonOption(testLead, FormatDisplayName(testLead)),
        developers,
        flowExcludedByDefault,
    });
})
.WithName("GetTeamRoles");

app.MapGet("/api/people", (ITeamRoleProvider teamRoleProvider) =>
{
    // Everyone in every role - a test task can be assigned to a tester, PO, QA lead, tech writer
    // etc., not just developers, so this deliberately isn't scoped like /api/developers.
    // GetAllTeamMembersForRole (not the per-team variant) so roles configured without a
    // TeamNord/TeamSyd suffix - QAEngineers, DevOps, TeamLeaders, TechnicalWriter - are included.
    var people = Enum.GetValues<TeamRoleType>()
        .Where(role => role != TeamRoleType.Undefined)
        .SelectMany(teamRoleProvider.GetAllTeamMembersForRole)
        .Where(email => !string.IsNullOrWhiteSpace(email))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Select(email => new PersonOption(email, FormatDisplayName(email)))
        .OrderBy(p => p.DisplayName)
        .ToList();
    return Results.Ok(people);
})
.WithName("GetAllPeople");

app.MapGet("/api/developers", (ITeamRoleProvider teamRoleProvider) =>
{
    // Development Partner can be any developer from either team, unlike Ansvarig which is
    // scoped to the card's own team.
    var nord = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.Developers, "TeamNord");
    var syd = teamRoleProvider.GetTeamMembersForRoleGroup(TeamRoleType.Developers, "TeamSyd");
    var people = nord.Concat(syd)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Select(email => new PersonOption(email, FormatDisplayName(email)))
        .OrderBy(p => p.DisplayName)
        .ToList();
    return Results.Ok(people);
})
.WithName("GetAllDevelopers");

app.MapGet("/api/workitems/{id:int}", async (
    int id,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var detail = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    return detail is null ? Results.NotFound() : Results.Ok(detail);
})
.WithName("GetWorkItemDetail");

app.MapPatch("/api/workitems/{id:int}", async (
    int id,
    WorkItemFieldUpdateRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var current = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (current is null)
        return Results.NotFound();

    var fields = new Dictionary<string, object?>();
    if (request.Title != null) fields["System.Title"] = request.Title;
    if (request.State != null) fields["System.State"] = request.State;
    if (request.AssignedTo != null) fields["System.AssignedTo"] = request.AssignedTo;
    // Identity fields need an actual null (not "") to clear in Azure - an empty string from the
    // "Ej nödvändigt/utses senare" checkbox means "clear the field", not "set it to blank text".
    if (request.DevelopmentPartner != null)
        fields["Custom.DevelopmentPartner"] = string.IsNullOrEmpty(request.DevelopmentPartner) ? null : request.DevelopmentPartner;
    if (request.StoryPoints.HasValue) fields["Microsoft.VSTS.Scheduling.StoryPoints"] = request.StoryPoints.Value;
    if (request.Description != null)
    {
        // Bugs keep their body in ReproSteps - System.Description stays blank for that type.
        var descriptionField = string.Equals(current.Type, "Bug", StringComparison.OrdinalIgnoreCase)
            ? "Microsoft.VSTS.TCM.ReproSteps"
            : "System.Description";
        fields[descriptionField] = request.Description;
    }
    if (request.AcceptanceCriteria != null) fields["Microsoft.VSTS.Common.AcceptanceCriteria"] = request.AcceptanceCriteria;
    if (request.AreaPath != null) fields["System.AreaPath"] = request.AreaPath;
    if (request.IterationPath != null) fields["System.IterationPath"] = request.IterationPath;
    if (request.Tags != null) fields["System.Tags"] = string.Join("; ", request.Tags);
    if (request.Reason != null) fields["System.Reason"] = request.Reason;
    if (request.Priority.HasValue) fields["Microsoft.VSTS.Common.Priority"] = request.Priority.Value;
    if (request.Severity != null) fields["Microsoft.VSTS.Common.Severity"] = request.Severity;
    if (request.Activity != null) fields["Microsoft.VSTS.Common.Activity"] = request.Activity;
    if (request.RemainingWork.HasValue) fields["Microsoft.VSTS.Scheduling.RemainingWork"] = request.RemainingWork.Value;
    if (request.CompletedWork.HasValue) fields["Microsoft.VSTS.Scheduling.CompletedWork"] = request.CompletedWork.Value;
    if (request.OriginalEstimate.HasValue) fields["Microsoft.VSTS.Scheduling.OriginalEstimate"] = request.OriginalEstimate.Value;
    if (request.BusinessValue.HasValue) fields["Microsoft.VSTS.Common.BusinessValue"] = request.BusinessValue.Value;
    if (request.ValueArea != null) fields["Microsoft.VSTS.Common.ValueArea"] = request.ValueArea;
    if (request.Source != null) fields["Custom.Source"] = request.Source;
    if (request.AssignedTeam != null) fields["Custom.AssignedTeam"] = request.AssignedTeam;
    // Custom.Stakeholders is an html field, not an identity one - it holds free text (a person,
    // a municipality, a note), so it goes through as-is. An empty string is handled downstream
    // as "clear this field".
    if (request.Stakeholders != null) fields["Custom.Stakeholders"] = request.Stakeholders;

    if (fields.Count == 0)
        return Results.BadRequest("No fields to update.");

    await azureDevOpsService.UpdateWorkItemFieldsAsync(id, fields, ct);
    var updated = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
})
.WithName("UpdateWorkItemFields");

app.MapPost("/api/workitems/{id:int}/tasks", async (
    int id,
    CreateTasksRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (request.Tasks is null || request.Tasks.Count == 0)
        return Results.BadRequest("No tasks to create.");

    // Defaults (area/iteration/assignee) come from the parent card - the DoR checklist only
    // needs to specify what's actually different about each need-category task (title/activity).
    var parent = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (parent is null)
        return Results.NotFound();

    var createdIds = new List<int>();
    foreach (var task in request.Tasks)
    {
        var taskId = await azureDevOpsService.CreateTaskAsync(
            id,
            task.Title,
            task.Activity,
            task.AssignedTo ?? parent.AssignedTo,
            task.State ?? "New",
            parent.AreaPath,
            parent.IterationPath,
            ct);
        createdIds.Add(taskId);
    }

    return Results.Ok(new { created = createdIds.Count, ids = createdIds });
})
.WithName("CreateWorkItemTasks");

// Creating a work item from an open card: "child" from the taskboard, "related" from the
// relations tab. Area/iteration default to the card's own, so a new item lands in the same sprint
// and area as the work it belongs to unless told otherwise.
app.MapPost("/api/workitems/{id:int}/children", async (
    int id,
    CreateWorkItemRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Title))
        return Results.BadRequest("A new work item needs a title.");
    if (string.IsNullOrWhiteSpace(request.Type))
        return Results.BadRequest("A new work item needs a type.");

    // Note the flip: the link is stored on the *new* item, so "child" means the new item points
    // up at this card (Hierarchy-Reverse), and "parent" means it points down (Hierarchy-Forward).
    var kind = request.LinkKind?.Trim().ToLowerInvariant();
    var linkRel = kind switch
    {
        "child" => "System.LinkTypes.Hierarchy-Reverse",
        "parent" => "System.LinkTypes.Hierarchy-Forward",
        "related" => "System.LinkTypes.Related",
        _ => null,
    };
    if (linkRel is null)
        return Results.BadRequest("linkKind must be 'parent', 'child' or 'related'.");

    var source = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (source is null)
        return Results.NotFound();

    if (kind == "child" && !WorkItemHierarchy.CanParent(source.Type, request.Type))
        return Results.BadRequest($"{source.Type} kan inte vara parent till {request.Type}.");
    if (kind == "parent")
    {
        if (source.Parent is not null)
            return Results.BadRequest("Kortet har redan en parent. Ta bort den först.");
        if (!WorkItemHierarchy.CanParent(request.Type, source.Type))
            return Results.BadRequest($"{request.Type} kan inte vara parent till {source.Type}.");
    }

    var fields = new Dictionary<string, object?>
    {
        ["System.Title"] = request.Title,
        ["System.AreaPath"] = string.IsNullOrWhiteSpace(request.AreaPath) ? source.AreaPath : request.AreaPath,
        ["System.IterationPath"] = string.IsNullOrWhiteSpace(request.IterationPath) ? source.IterationPath : request.IterationPath,
    };
    if (!string.IsNullOrWhiteSpace(request.AssignedTo)) fields["System.AssignedTo"] = request.AssignedTo;
    if (!string.IsNullOrWhiteSpace(request.Activity)) fields["Microsoft.VSTS.Common.Activity"] = request.Activity;
    if (request.Tags is { Count: > 0 }) fields["System.Tags"] = string.Join("; ", request.Tags);
    if (!string.IsNullOrWhiteSpace(request.Description))
    {
        fields[string.Equals(request.Type, "Bug", StringComparison.OrdinalIgnoreCase)
            ? "Microsoft.VSTS.TCM.ReproSteps"
            : "System.Description"] = request.Description;
    }

    var newId = await azureDevOpsService.CreateWorkItemAsync(request.Type, fields, id, linkRel, ct);
    return Results.Ok(new { id = newId });
})
.WithName("CreateLinkedWorkItem");

// Used by the DoR checklist when a category is switched from "task finns" to "behövs ej".
// Azure moves the item to the project's recycle bin rather than destroying it, so a mistake here
// is recoverable from Azure DevOps.
app.MapDelete("/api/workitems/{id:int}", async (
    int id,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var item = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (item is null)
        return Results.NotFound();

    // The hjälptext satellite is a story that owns its own Documentation task; deleting only the
    // story would leave that task orphaned, so its children go first.
    foreach (var child in item.Children)
        await azureDevOpsService.DeleteWorkItemAsync(child.Id, ct);

    await azureDevOpsService.DeleteWorkItemAsync(id, ct);
    return Results.Ok(new { deleted = id, alsoDeleted = item.Children.Select(c => c.Id).ToList() });
})
.WithName("DeleteWorkItem");

// Links an existing work item to this one, and unlinks again. The hierarchy rules are enforced
// here as well as in the UI - the UI stops the obvious mistakes, this stops the rest, since an
// invalid parent/child pair is rejected by Azure with a message nobody can act on.
app.MapPost("/api/workitems/{id:int}/relations", async (
    int id,
    RelationRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var linkRel = WorkItemHierarchy.LinkRelFor(request.LinkKind);
    if (linkRel is null)
        return Results.BadRequest("linkKind must be 'parent', 'child' or 'related'.");
    if (request.TargetId == id)
        return Results.BadRequest("Ett kort kan inte länkas till sig självt.");

    var source = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    var target = await azureDevOpsService.GetWorkItemDetailAsync(request.TargetId, ct);
    if (source is null || target is null)
        return Results.NotFound();

    if (request.LinkKind == "parent")
    {
        if (source.Parent is not null)
            return Results.BadRequest("Kortet har redan en parent. Ta bort den först.");
        if (!WorkItemHierarchy.CanParent(target.Type, source.Type))
            return Results.BadRequest($"{target.Type} kan inte vara parent till {source.Type}.");
    }
    else if (request.LinkKind == "child")
    {
        if (!WorkItemHierarchy.CanParent(source.Type, target.Type))
            return Results.BadRequest($"{source.Type} kan inte vara parent till {target.Type}.");
        if (target.Parent is not null)
            return Results.BadRequest($"#{target.Id} har redan en parent. Ett kort kan bara ha en.");
    }

    await azureDevOpsService.AddWorkItemRelationAsync(id, request.TargetId, linkRel, ct);
    var updated = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
})
.WithName("AddWorkItemRelation");

app.MapDelete("/api/workitems/{id:int}/relations", async (
    int id,
    int targetId,
    string linkKind,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var linkRel = WorkItemHierarchy.LinkRelFor(linkKind);
    if (linkRel is null)
        return Results.BadRequest("linkKind must be 'parent', 'child' or 'related'.");

    await azureDevOpsService.RemoveWorkItemRelationAsync(id, targetId, linkRel, ct);
    var updated = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
})
.WithName("RemoveWorkItemRelation");

app.MapPost("/api/workitems/{id:int}/comments", async (
    int id,
    AddCommentRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Text))
        return Results.BadRequest("A comment needs text.");

    await azureDevOpsService.AddWorkItemCommentAsync(id, request.Text, ct);
    var updated = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
})
.WithName("AddWorkItemComment");

// Builds the sprint-review report and, unless dryRun, posts it to the team's Teams channel.
// The same payload is used for both, so what the preview shows is exactly what gets posted.
app.MapPost("/api/review/publish", async (
    ReviewReportRequest request,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var payload = ReviewReport.BuildAdaptiveCard(request);

    if (request.DryRun)
        return Results.Ok(new { posted = false, card = payload });

    var webhookUrl = configuration[$"Teams:ReviewWebhookUrl:{request.Team}"]
                     ?? configuration["Teams:ReviewWebhookUrl:Default"];
    if (string.IsNullOrWhiteSpace(webhookUrl))
    {
        // Plain text rather than Results.BadRequest: these two messages are shown to the user
        // verbatim in the preview dialog, and a JSON-encoded string would arrive wrapped in quotes.
        return Results.Text(
            "Ingen Teams-webhook är konfigurerad. Lägg in URL:en under Teams:ReviewWebhookUrl i appsettings.json " +
            "(se docs/TEAMS_SETUP.md).", "text/plain", statusCode: 400);
    }

    var client = httpClientFactory.CreateClient();
    // Serialised by hand rather than via PostAsJsonAsync: the TFS client library ships its own
    // PostAsJsonAsync extension, and with both in scope the call is ambiguous.
    using var content = new StringContent(
        ReviewReport.ToJson(payload), System.Text.Encoding.UTF8, "application/json");
    var response = await client.PostAsync(webhookUrl, content, ct);
    var body = await response.Content.ReadAsStringAsync(ct);
    if (!response.IsSuccessStatusCode)
        return Results.Text($"Teams svarade {(int)response.StatusCode}: {body}", "text/plain", statusCode: 400);

    return Results.Ok(new { posted = true, card = payload });
})
.WithName("PublishReviewReport");

// Free-text/ID lookup behind the "länka befintligt kort" picker. A pure number is treated as an
// id (that's how people refer to cards to each other), anything else as a title search.
app.MapGet("/api/workitems/search", async (
    string q,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var term = (q ?? "").Trim();
    if (term.Length < 2)
        return Results.Ok(Array.Empty<object>());

    IReadOnlyList<int> ids;
    if (int.TryParse(term, out var byId))
    {
        // Still run through WIQL rather than fetching blindly, so an id that doesn't exist (or
        // isn't visible) comes back as "no hits" instead of an error.
        ids = await azureDevOpsService.RunWiqlIdsAsync(
            $"SELECT [System.Id] FROM WorkItems WHERE [System.Id] = {byId}", ct);
    }
    else
    {
        // Apostrophes have to be doubled or they end the WIQL string literal.
        var safe = term.Replace("'", "''");
        ids = await azureDevOpsService.RunWiqlIdsAsync(
            "SELECT [System.Id] FROM WorkItems " +
            $"WHERE [System.Title] CONTAINS '{safe}' AND [System.State] <> 'Removed' " +
            "ORDER BY [System.ChangedDate] DESC", ct);
    }

    if (ids.Count == 0)
        return Results.Ok(Array.Empty<object>());

    var items = await azureDevOpsService.GetWorkItemsDetailsAsync(ids.Take(50).ToList(), ct);
    return Results.Ok(items.Select(i => new { id = i.Id, type = i.Type, title = i.Title, state = i.State }).ToList());
})
.WithName("SearchWorkItems");

// The cards that may legitimately be the parent of `type`, for the Korthygien parent picker.
// Closed items are left out: attaching new work under something already finished is almost never
// what's meant, and it keeps the list short enough to scan.
app.MapGet("/api/workitems/parent-candidates", async (
    string type,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var parentTypes = WorkItemHierarchy.ParentTypesFor(type);
    if (parentTypes.Count == 0)
        return Results.Ok(Array.Empty<object>());

    var typeList = string.Join(", ", parentTypes.Select(t => $"'{t}'"));
    var wiql =
        $"SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ({typeList}) " +
        "AND [System.State] <> 'Closed' AND [System.State] <> 'Removed' ORDER BY [System.Id] DESC";

    var ids = await azureDevOpsService.RunWiqlIdsAsync(wiql, ct);
    if (ids.Count == 0)
        return Results.Ok(Array.Empty<object>());

    var items = await azureDevOpsService.GetWorkItemsDetailsAsync(ids.Take(400).ToList(), ct);
    return Results.Ok(items
        .Select(i => new { id = i.Id, type = i.Type, title = i.Title, state = i.State })
        .OrderBy(i => i.title, StringComparer.CurrentCultureIgnoreCase)
        .ToList());
})
.WithName("GetParentCandidates");

// Feeds every picker in the card view: Area Path, Iteration, tags, and the per-type picklists
// (State, Reason, Severity, Activity, Value Area, Source, Assigned Team). The picklists come from
// the process template rather than being hardcoded - the real values are not guessable
// ("2 - High (< 16 h )", "Internal"), and a wrong one makes Azure reject the entire save.
app.MapGet("/api/classification", async (IAzureDevOpsService azureDevOpsService, CancellationToken ct) =>
{
    var areas = await azureDevOpsService.GetClassificationPathsAsync(areas: true, ct);
    var iterations = await azureDevOpsService.GetClassificationPathsAsync(areas: false, ct);
    var tags = await azureDevOpsService.GetTagsAsync(ct);

    var fieldOptions = new Dictionary<string, IReadOnlyDictionary<string, IReadOnlyList<string>>>();
    foreach (var type in new[] { "User Story", "Bug", "Task", "Feature", "Epic" })
    {
        try
        {
            fieldOptions[type] = await azureDevOpsService.GetWorkItemTypeFieldOptionsAsync(type, ct);
        }
        catch
        {
            // A type this project doesn't define shouldn't take the whole picker payload down -
            // the client falls back to leaving that type's dropdowns as free-form.
        }
    }

    return Results.Ok(new { areas, iterations, tags, fieldOptions });
})
.WithName("GetClassification");

app.MapPost("/api/workitems/{id:int}/helptext-story", async (
    int id,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    // Hjälptext cards are being broken out of the development story: instead of a plain child
    // Task, DoR now creates a separate related (not child) User Story that itself owns a
    // Documentation-activity Task titled with a "hjälptext-" prefix - the "Hjälptext –" title
    // prefix on the story is also what the Dailys board uses to recognize and hide this
    // satellite card from the top-level story list.
    var parent = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (parent is null)
        return Results.NotFound();

    var storyId = await azureDevOpsService.CreateRelatedUserStoryAsync(
        id,
        $"Hjälptext – {parent.Title}",
        parent.AssignedTo,
        parent.AreaPath,
        parent.IterationPath,
        ct);
    var taskId = await azureDevOpsService.CreateTaskAsync(
        storyId,
        $"hjälptext-{parent.Title}",
        "Documentation",
        parent.AssignedTo,
        "New",
        parent.AreaPath,
        parent.IterationPath,
        ct);

    return Results.Ok(new { storyId, taskId });
})
.WithName("CreateHelptextStory");

app.MapGet("/api/attachments/{id:guid}", async (
    Guid id,
    string? fileName,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var (bytes, contentType) = await azureDevOpsService.GetWorkItemAttachmentAsync(id, fileName, ct);
    return Results.File(bytes, contentType);
})
.WithName("GetAttachment");

app.MapPost("/api/attachments", async (
    HttpRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var fileName = request.Query["fileName"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(fileName))
        return Results.BadRequest("fileName query parameter is required.");

    using var buffer = new MemoryStream();
    await request.Body.CopyToAsync(buffer, ct);
    var contentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/octet-stream" : request.ContentType;

    var (id, proxyUrl, azureUrl) = await azureDevOpsService.UploadWorkItemAttachmentAsync(
        buffer.ToArray(), fileName, contentType, ct);
    // azureUrl is what gets written into the card, proxyUrl is what the browser can actually load.
    return Results.Ok(new { id, url = proxyUrl, azureUrl });
})
.WithName("UploadAttachment");

// ---------------------------------------------------------------------------------------------
// AvekiSupport: a small surface for people who report bugs but don't live in Azure DevOps.
// Everything below writes ordinary Bugs into the same project - there is no separate store.
// ---------------------------------------------------------------------------------------------

// Everything the new-bug form needs in one call: the real picklists from the process template,
// the area paths to file under, and the System Info skeleton.
app.MapGet("/api/support/options", async (
    HttpContext http,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    IOptions<TeamRoleConfig> teamRoles,
    CancellationToken ct) =>
{
    var areas = await azureDevOpsService.GetClassificationPathsAsync(areas: true, ct);

    IReadOnlyList<string> severities = Array.Empty<string>();
    IReadOnlyList<string> sources = Array.Empty<string>();
    try
    {
        var fieldOptions = await azureDevOpsService.GetWorkItemTypeFieldOptionsAsync("Bug", ct);
        if (fieldOptions.TryGetValue("Microsoft.VSTS.Common.Severity", out var severityValues)) severities = severityValues;
        if (fieldOptions.TryGetValue("Custom.Source", out var sourceValues)) sources = sourceValues;
    }
    catch
    {
        // A picklist we can't read shouldn't block the form - it falls back to a plain text field.
    }

    var project = configuration["AzureDevOps:Project"] ?? "";
    // Note the IsNullOrWhiteSpace rather than ??: an unset key in appsettings.json is an empty
    // string, not null, so ?? would hand the client "" and leave the picker blank.
    var configuredTemplate = configuration["Support:SystemInfoTemplate"];

    // Nord and Syd support different products, so the area path a bug should start on depends on
    // who is filing it. Read from the sign-in rather than asked for - the whole point is that
    // someone who opens this twice a year doesn't have to know which area path is theirs.
    var team = SupportBugs.TeamFor(SignedInUserReader.Read(http.User, teamRoles.Value.TeamRoleMapping).RoleGroups);

    var backlogIteration = configuration["Support:BacklogIterationPath"];
    if (string.IsNullOrWhiteSpace(backlogIteration)) backlogIteration = project;

    List<SupportIterationOption> iterations;
    try
    {
        var nodes = await azureDevOpsService.GetIterationNodesAsync(ct);
        iterations = SupportBugs.BuildIterationOptions(
            nodes, backlogIteration, configuration["Testing:IterationPathOverride"], DateTime.UtcNow.Date);
    }
    catch
    {
        // The backlog is where nearly every bug goes anyway; losing the sprint list shouldn't cost
        // anyone the ability to file one.
        iterations = new List<SupportIterationOption> { new(backlogIteration, "Produktbacklogg", "backlog") };
    }

    return Results.Ok(new
    {
        areas,
        severities,
        sources,
        iterations,
        stakeholderCategories = SupportBugs.StakeholderCategories,
        systemInfoTemplate = string.IsNullOrWhiteSpace(configuredTemplate) ? SupportBugs.DefaultSystemInfoTemplate : configuredTemplate,
        team,
        defaultAreaPath = SupportBugs.ResolveDefaultAreaPath(team, configuration, project, areas),
        // The backlog, always: a newly reported bug hasn't been prioritised yet, and saying so is
        // more honest than dropping it into whatever sprint happens to be running.
        defaultIterationPath = backlogIteration,
        defaultSeverity = Fallback(configuration["Support:DefaultSeverity"], "3 - Medium"),
        defaultSource = Fallback(configuration["Support:DefaultSource"], "Customer"),
    });
})
.WithName("GetSupportOptions");

app.MapPost("/api/support/bugs", async (
    CreateSupportBugRequest request,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Title))
        return Results.Text("Ärendet behöver en rubrik.", "text/plain", statusCode: 400);
    if (string.IsNullOrWhiteSpace(request.ReproSteps))
        return Results.Text("Ärendet behöver en beskrivning.", "text/plain", statusCode: 400);

    var reporter = request.Stakeholders?.FirstOrDefault(
        s => string.Equals(s.Category, "Buggrapportör", StringComparison.OrdinalIgnoreCase));
    if (reporter is null || string.IsNullOrWhiteSpace(reporter.Name))
        return Results.Text("Ärendet behöver en buggrapportör.", "text/plain", statusCode: 400);

    var project = configuration["AzureDevOps:Project"] ?? "";
    // The PO's backlog is the project root iteration: a bug lands there unplanned, and moving it
    // into a sprint is exactly what the team's prioritisation does.
    var backlogIteration = configuration["Support:BacklogIterationPath"];
    if (string.IsNullOrWhiteSpace(backlogIteration)) backlogIteration = project;
    var supportTag = configuration["Support:BugTag"] ?? "AvekiSupport";

    var tags = new List<string> { supportTag };
    if (request.Tags is { Count: > 0 })
        tags.AddRange(request.Tags.Where(t => !string.IsNullOrWhiteSpace(t)));

    var fields = new Dictionary<string, object?>
    {
        ["System.Title"] = request.Title.Trim(),
        ["System.AreaPath"] = string.IsNullOrWhiteSpace(request.AreaPath)
            ? (string.IsNullOrWhiteSpace(configuration["Support:DefaultAreaPath"]) ? project : configuration["Support:DefaultAreaPath"])
            : request.AreaPath,
        // The form defaults to the backlog and rarely offers anything else, but a support person
        // who already knows the sprint it belongs in shouldn't have to ask someone to move it.
        ["System.IterationPath"] = string.IsNullOrWhiteSpace(request.IterationPath) ? backlogIteration : request.IterationPath,
        ["Microsoft.VSTS.TCM.ReproSteps"] = request.ReproSteps,
        ["System.Tags"] = string.Join("; ", tags.Distinct(StringComparer.OrdinalIgnoreCase)),
        ["Custom.Stakeholders"] = SupportBugs.FormatStakeholders(request.Stakeholders ?? new List<SupportStakeholder>()),
    };
    if (!string.IsNullOrWhiteSpace(request.Severity)) fields["Microsoft.VSTS.Common.Severity"] = request.Severity;
    if (!string.IsNullOrWhiteSpace(request.Source)) fields["Custom.Source"] = request.Source;
    if (!string.IsNullOrWhiteSpace(request.SystemInfo)) fields["Microsoft.VSTS.TCM.SystemInfo"] = request.SystemInfo;
    if (!string.IsNullOrWhiteSpace(request.ExternalLink)) fields["Custom.Externallink"] = request.ExternalLink.Trim();

    var id = await azureDevOpsService.CreateWorkItemAsync("Bug", fields, null, null, ct);
    var organization = configuration["AzureDevOps:Organization"] ?? "";
    return Results.Ok(new { id, url = $"https://dev.azure.com/{organization}/{project}/_workitems/edit/{id}" });
})
.WithName("CreateSupportBug");

// The dashboard. A bug belongs to support if it carries the support tag (this tool filed it) or
// has a Lime link in the External link field (support filed it by hand in Azure) - the second is
// how the several hundred already-reported bugs get picked up.
//
// The date window is a query parameter rather than a client-side filter: there are hundreds of
// these, and fetching every one of them since the beginning of time to then hide most is both slow
// and misleading about what the list contains.
app.MapGet("/api/support/bugs", async (
    string? from,
    string? to,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    IOptions<TeamRoleConfig> teamRoles,
    CancellationToken ct) =>
{
    var project = configuration["AzureDevOps:Project"] ?? "";
    var organization = configuration["AzureDevOps:Organization"] ?? "";
    var supportTag = configuration["Support:BugTag"] ?? "AvekiSupport";

    var fromDate = ParseDate(from) ?? DateTime.UtcNow.Date.AddYears(-1);
    var toDate = ParseDate(to);

    var conditions = new List<string>
    {
        "[System.WorkItemType] = 'Bug'",
        "[System.State] <> 'Removed'",
        $"([System.Tags] CONTAINS '{supportTag.Replace("'", "''")}' OR [Custom.Externallink] <> '')",
        $"[System.CreatedDate] >= '{fromDate:yyyy-MM-dd}T00:00:00Z'",
    };
    // Azure compares CreatedDate inclusively against the instant, so "to" needs the following
    // midnight or the last day of the range drops out.
    if (toDate.HasValue)
        conditions.Add($"[System.CreatedDate] < '{toDate.Value.AddDays(1):yyyy-MM-dd}T00:00:00Z'");

    var ids = await azureDevOpsService.RunWiqlIdsAsync(
        "SELECT [System.Id] FROM WorkItems WHERE " + string.Join(" AND ", conditions) +
        " ORDER BY [System.CreatedDate] DESC", ct);

    if (ids.Count == 0)
        return Results.Ok(new { bugs = Array.Empty<object>(), truncated = false, total = 0 });

    // A hard ceiling so a wide date range can't turn into a minutes-long request. The client says
    // so when it bites, rather than quietly showing a partial list.
    const int maxItems = 600;
    var truncated = ids.Count > maxItems;
    var items = await azureDevOpsService.GetWorkItemsDetailsAsync(ids.Take(maxItems).ToList(), ct);

    // Everyone at the company, for telling colleagues apart from customers in the stakeholder
    // field: the role config is the closest thing to a staff list we have, plus any extra names
    // for people (support, sales) who aren't on a Scrum team.
    var colleagueNames = (teamRoles.Value.TeamRoleMapping ?? new())
        .SelectMany(group => group.Value ?? new List<string>())
        .Select(PersonNames.Format)
        .Concat(configuration.GetSection("Support:AdditionalCompanyNames").Get<string[]>() ?? Array.Empty<string>())
        .ToList();
    var directory = new SupportBugs.CompanyDirectory(colleagueNames);

    var bugs = items.Select(item =>
    {
        var (statusKey, statusLabel) = SupportBugs.StatusFor(item.State, item.IterationPath);
        // The raw html, not the ';'-split list: pasted Word markup and &nbsp; entities both
        // contain semicolons, and the split turns them into nonsense "stakeholders".
        var rawStakeholders = item.StakeholdersHtml;
        var parsed = SupportBugs.ParseStakeholders(rawStakeholders, directory);
        return new
        {
            id = item.Id,
            title = item.Title,
            state = item.State,
            severity = item.Severity,
            source = item.Source,
            areaPath = item.AreaPath,
            iterationPath = item.IterationPath,
            assignedTo = item.AssignedTo,
            createdBy = item.CreatedBy,
            createdDate = item.CreatedDate,
            changedDate = item.ChangedDate,
            closedDate = item.ClosedDate,
            reporter = SupportBugs.ReporterFrom(rawStakeholders, item.CreatedBy),
            // Everything that isn't a customer is one of ours - a recognised name, or a line this
            // tool labelled itself as Buggrapportör/Support/Intern.
            colleagues = parsed.Where(p => p.Category != "Kund").Select(p => p.Name).ToList(),
            customers = parsed.Where(p => p.Category == "Kund").Select(p => p.Name).ToList(),
            versions = SupportBugs.VersionsFor(item.IterationPath, item.Tags),
            externalLink = item.ExternalLink,
            tags = item.Tags,
            statusKey,
            statusLabel,
            webUrl = $"https://dev.azure.com/{organization}/{project}/_workitems/edit/{item.Id}",
        };
    }).ToList();

    return Results.Ok(new { bugs, truncated, total = ids.Count });
})
.WithName("GetSupportBugs");

// Anything that isn't an api route is the single-page app. AllowAnonymous because index.html is
// what *bootstraps* the sign-in - requiring a token to fetch the page that acquires the token
// would leave the user staring at a 401.
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

static string FormatDisplayName(string email) => PersonNames.Format(email);

/// <summary>Config value, or the given default when the key is missing or blank.</summary>
static string Fallback(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value;

/// <summary>A yyyy-MM-dd query parameter, or null when absent or unparseable.</summary>
static DateTime? ParseDate(string? value) =>
    DateTime.TryParse(value, System.Globalization.CultureInfo.InvariantCulture,
        System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
        out var parsed)
        ? parsed.Date
        : null;

/// <summary>
/// Turns an Azure login (or a display-name-less guest identity) into the name the person actually
/// spells. Azure logins are ASCII, so a naive derivation gets Swedish names wrong ("Bergstrom",
/// "Jongren") - and that spelling then fails to match the real display name on a card, which is
/// how an assigned card could end up looking unassigned. Mirrors lib/personNames.ts on the client.
/// </summary>
internal static class PersonNames
{
    private static readonly Dictionary<string, string> KnownParts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["bjorn"] = "Björn",
        ["goran"] = "Göran",
        ["jorgen"] = "Jörgen",
        ["lindstrom"] = "Lindström",
        ["bergstrom"] = "Bergström",
        ["angstrom"] = "Ångström",
        ["jongren"] = "Jöngren",
        ["nordstrom"] = "Nordström",
        ["lonnblom"] = "Lönnblom",
        ["backo"] = "Backö",
        ["alhindy"] = "AlHindy",
    };

    /// <summary>
    /// External guests often have no display name set and surface as "local.part domain.tld" - the
    /// @ effectively swapped for a space (e.g. "dennis.bergstrom invit.se"). Recognised so the
    /// trailing domain isn't title-cased into the middle of someone's name.
    /// </summary>
    private static readonly System.Text.RegularExpressions.Regex GuestIdentity =
        new(@"^([\w.-]+)\s+[\w-]+\.[a-z]{2,}$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    public static string Format(string? value)
    {
        var raw = (value ?? "").Trim();
        if (raw.Length == 0) return "";

        var guest = GuestIdentity.Match(raw);
        var local = raw.Contains('@') ? raw.Split('@')[0] : guest.Success ? guest.Groups[1].Value : raw;

        var parts = local.Split(new[] { '.', '_', '-', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p =>
            KnownParts.TryGetValue(p, out var known) ? known : char.ToUpperInvariant(p[0]) + p[1..].ToLowerInvariant()));
    }
}

internal sealed record PersonOption(string Email, string DisplayName);

internal sealed record WorkItemFieldUpdateRequest(
    string? Title,
    string? State,
    string? AssignedTo,
    string? DevelopmentPartner,
    double? StoryPoints,
    string? Description,
    string? AcceptanceCriteria,
    string? AreaPath,
    string? IterationPath,
    List<string>? Tags,
    // Everything below is editable too - the card view used to render these read-only, which meant
    // the app could show a field it had no way to correct.
    int? Priority,
    string? Severity,
    string? Source,
    string? Activity,
    double? RemainingWork,
    double? CompletedWork,
    double? OriginalEstimate,
    double? BusinessValue,
    string? ValueArea,
    string? AssignedTeam,
    string? Stakeholders,
    string? Reason);

internal sealed record CreateWorkItemRequest(
    string Type,
    string Title,
    /// "child" links the new item under this card, "related" links it beside it.
    string LinkKind,
    string? AssignedTo,
    string? Description,
    string? Activity,
    string? AreaPath,
    string? IterationPath,
    List<string>? Tags);

internal sealed record AddCommentRequest(string Text);

internal sealed record RelationRequest(int TargetId, string LinkKind);

/// <summary>
/// The backlog hierarchy this project actually uses: Epic → Feature → User Story/Bug → Task.
/// A User Story or Bug can't own another one, and a Task is always a leaf. Azure itself is more
/// permissive than the process the team follows, so the rules live here rather than being left
/// to whatever the API happens to allow.
/// </summary>
internal static class WorkItemHierarchy
{
    private static readonly Dictionary<string, string[]> AllowedChildren = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Epic"] = new[] { "Feature" },
        ["Feature"] = new[] { "User Story", "Product Backlog Item", "Bug" },
        ["User Story"] = new[] { "Task" },
        ["Product Backlog Item"] = new[] { "Task" },
        ["Bug"] = new[] { "Task" },
        ["Task"] = Array.Empty<string>(),
    };

    /// <summary>The types allowed to be the parent of <paramref name="childType"/>.</summary>
    public static IReadOnlyList<string> ParentTypesFor(string childType) =>
        AllowedChildren
            .Where(pair => pair.Value.Contains(childType ?? "", StringComparer.OrdinalIgnoreCase))
            .Select(pair => pair.Key)
            .ToList();

    public static bool CanParent(string parentType, string childType) =>
        AllowedChildren.TryGetValue(parentType ?? "", out var allowed) &&
        allowed.Contains(childType ?? "", StringComparer.OrdinalIgnoreCase);

    public static string? LinkRelFor(string? linkKind) => linkKind?.Trim().ToLowerInvariant() switch
    {
        // "parent" points up from this card, "child" points down - Azure names them from the
        // perspective of the item the relation is stored on.
        "parent" => "System.LinkTypes.Hierarchy-Reverse",
        "child" => "System.LinkTypes.Hierarchy-Forward",
        "related" => "System.LinkTypes.Related",
        _ => null,
    };
}

internal sealed record NewTaskRequest(string Title, string? Activity, string? AssignedTo, string? State);

internal sealed record CreateTasksRequest(List<NewTaskRequest> Tasks);
