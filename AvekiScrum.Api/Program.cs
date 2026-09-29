using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Abstractions.Repositories;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Boards.Dailys;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.DTOs.Scrum.TestPlans;
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
builder.Services.Configure<DailyCheckInSettings>(builder.Configuration.GetSection("DailyCheckIns"));
builder.Services.Configure<TalkingPointSettings>(builder.Configuration.GetSection("TalkingPoints"));
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
// Trimmed. `set Auth__Mode=Pat && dotnet run` in a batch file hands over "Pat " - the space before
// the && is part of the value - and surrounding whitespace should never be the difference between
// a working app and one that refuses to start.
var authMode = (builder.Configuration["Auth:Mode"] ?? "Pat").Trim();
if (authMode.Length == 0) authMode = "Pat";
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
    // The trimmed value, i.e. the one actually in force - reporting the raw config here would show
    // "EntraWithPat " and send someone hunting for a difference that no longer exists.
    authMode,
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
    // The sprint picker's explicit choice - takes priority over everything else below, since
    // picking a sprint by hand is a more specific instruction than either the date-based default
    // or the sandbox's date-independent override.
    string? iteration,
    IAzureDevOpsService azureDevOpsService,
    ITeamRoleProvider teamRoleProvider,
    DailyDashboardDataBuilder builder,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var (scoped, error) = await ResolveScopedTeamDataAsync(team, iteration, azureDevOpsService, teamRoleProvider, configuration, ct);
    if (error is not null) return error;

    var backlogByTeam = new Dictionary<DeveloperTeam, IReadOnlyList<AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto>>
    {
        [scoped!.Team] = scoped.ScopedWorkItems
    };

    var json = await builder.BuildJsonAsync(scoped.Sprint, backlogByTeam, scoped.ProductOwnerStoryIds);
    return Results.Content(json, "application/json");
})
.WithName("GetDailys");

// Refreshes just one person's cards instead of the whole team's board: skips the PR-detail and
// test-timeline Azure calls for every story that isn't theirs (see the comment on
// DailyDashboardDataBuilder.BuildPersonJsonAsync), so this comes back much faster than /api/dailys
// during a running standup. The client merges the returned stories into its existing board state
// rather than replacing it.
app.MapGet("/api/dailys/person", async (
    string team,
    string person,
    string? iteration,
    IAzureDevOpsService azureDevOpsService,
    ITeamRoleProvider teamRoleProvider,
    DailyDashboardDataBuilder builder,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(person))
        return Results.BadRequest("Missing 'person'.");

    var (scoped, error) = await ResolveScopedTeamDataAsync(team, iteration, azureDevOpsService, teamRoleProvider, configuration, ct);
    if (error is not null) return error;

    var json = await builder.BuildPersonJsonAsync(
        scoped!.Sprint,
        scoped.Team,
        scoped.ScopedWorkItems,
        person,
        scoped.ProductOwnerStoryIds);
    return Results.Content(json, "application/json");
})
.WithName("GetDailyPersonRefresh");

// Saves the daily flow's own incheckningssiffror (developer energy, sprint-goal confidence, the
// PO/test-lead closing turns) once a round finishes - see DailyFlow.tsx's persistCheckIns, which is
// the only caller. Upserting (see IDailyCheckInRepository) is what makes a practice run of the
// flow before the real daily harmless: the real run's save for the same calendar day simply
// overwrites it instead of leaving a duplicate behind.
app.MapPost("/api/dailys/checkins", async (
    SaveDailyCheckInsRequest request,
    IDailyCheckInRepository repository,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(request.Team, ignoreCase: true, out _))
        return Results.BadRequest($"Unknown team '{request.Team}'. Expected 'Nord' or 'Syd'.");
    if (string.IsNullOrWhiteSpace(request.SprintPath))
        return Results.BadRequest("Missing 'sprintPath'.");
    if (!DateOnly.TryParse(request.Date, out var date))
        return Results.BadRequest($"Unparseable 'date': '{request.Date}'. Expected yyyy-MM-dd.");
    if (request.Entries is null || request.Entries.Count == 0)
        return Results.Ok(); // Nothing checked in this round - not an error, just nothing to save.

    var entries = request.Entries
        .Select(e => new DailyCheckIn
        {
            Team = request.Team,
            SprintPath = request.SprintPath,
            SprintName = request.SprintName,
            Date = date,
            Kind = e.Kind,
            Key = e.Key,
            Label = e.Label,
            Score = e.Score,
        })
        .ToList();

    await repository.UpsertAsync(entries, ct);
    return Results.Ok();
})
.WithName("SaveDailyCheckIns");

// Sprint inflow (Dailys' "new cards"/"SP changed" groups): which of the given stories had their
// Story Points changed after the given cutoff - the candidate id list is exactly the board's own
// "existed before the cutoff" stories (see dailysLogic.ts), so this never has to re-derive team or
// sprint on its own. One GetWorkItemUpdatesAsync call per candidate, same as the test-task timeline
// pipeline already does per test task - run concurrently for the same reason ReleaseOpenItemsView's
// multi-sprint fetch does (a sequential loop over even a modest number of stories was slow enough to
// notice). Loaded asynchronously by the client after the main board renders, not part of /api/dailys
// itself, so a slow history lookup never delays the board a team actually stands around waiting for.
app.MapPost("/api/dailys/story-points-changes", async (
    StoryPointsChangesRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (request.StoryIds is null || request.StoryIds.Count == 0)
        return Results.Ok(Array.Empty<object>());
    if (!DateTimeOffset.TryParse(request.CutoffUtc, out var cutoff))
        return Results.BadRequest("Unparseable 'cutoffUtc'.");

    var checks = await Task.WhenAll(request.StoryIds.Select(async id =>
    {
        var updates = await azureDevOpsService.GetWorkItemUpdatesAsync(id, ct);
        var spRevisions = updates.Value
            .Select(u => new { Date = u.EffectiveChangedDate, Change = u.Fields?.StoryPoints })
            .Where(x => x.Date.HasValue && x.Change != null)
            .OrderBy(x => x.Date)
            .ToList();

        var postCutoff = spRevisions.Where(x => x.Date!.Value > cutoff).ToList();
        if (postCutoff.Count == 0)
            return null;

        var oldValue = postCutoff[0].Change!.OldValue ?? 0;
        var newValue = postCutoff[^1].Change!.NewValue ?? 0;
        // Multiple changes can cancel out (bumped up, then back down) - only worth flagging if the
        // net result across the whole post-cutoff window actually differs.
        if (Math.Abs(oldValue - newValue) < 0.01)
            return null;

        return new { id, oldStoryPoints = oldValue, newStoryPoints = newValue, changedAt = postCutoff[^1].Date!.Value.ToString("o") };
    }));

    return Results.Ok(checks.Where(c => c != null));
})
.WithName("GetStoryPointsChanges");

// Reads back what's been saved so far - not wired into any UI yet (the retro-facing view is still
// being designed), but useful to inspect what a few sprints' worth of data actually looks like.
app.MapGet("/api/dailys/checkins", async (
    string team,
    IDailyCheckInRepository repository,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var entries = await repository.GetByTeamAsync(developerTeam, ct);
    return Results.Ok(entries);
})
.WithName("GetDailyCheckIns");

// "Saker att ta upp" - notes prepared ahead of time (often on a PO's request) that should be raised
// with a specific person once the daily flow reaches them. See ITalkingPointRepository/
// JsonFileTalkingPointRepository for storage, and DailyFlow.tsx for how these get woven into the
// flow's own step order.
var talkingPoints = app.MapGroup("/api/talking-points");

// "Both" is a valid Scope/team-filter value but not a DeveloperTeam - these three helpers are the
// one place that trio of strings ("Nord"/"Syd"/"Both") gets validated and parsed.
static bool IsValidScope(string? scope) => scope is "Nord" or "Syd" or "Both";

talkingPoints.MapGet("/", async (
    string? team,
    ITalkingPointRepository repository,
    CancellationToken ct) =>
{
    // No 'team' at all -> everything, any scope (the settings modal's "Alla" filter). A concrete
    // team returns just what's relevant to it (Scope == that team or "Both") - DailyFlow's own use.
    if (string.IsNullOrWhiteSpace(team))
        return Results.Ok(await repository.GetAllAsync(ct));
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var points = await repository.GetForTeamAsync(developerTeam, ct);
    return Results.Ok(points);
})
.WithName("GetTalkingPoints");

talkingPoints.MapPost("/", async (
    CreateTalkingPointRequest request,
    ITalkingPointRepository repository,
    CancellationToken ct) =>
{
    if (!IsValidScope(request.Scope))
        return Results.BadRequest($"Unknown scope '{request.Scope}'. Expected 'Nord', 'Syd' or 'Both'.");
    if (string.IsNullOrWhiteSpace(request.AssigneeEmail))
        return Results.BadRequest("Missing 'assigneeEmail'.");

    var created = await repository.CreateAsync(new TalkingPoint
    {
        Scope = request.Scope,
        BodyHtml = request.BodyHtml ?? "",
        AssigneeEmail = request.AssigneeEmail,
        AssigneeDisplayName = string.IsNullOrWhiteSpace(request.AssigneeDisplayName) ? request.AssigneeEmail : request.AssigneeDisplayName,
        CreatedByEmail = request.CreatedByEmail ?? "",
        CreatedByDisplayName = request.CreatedByDisplayName ?? "",
        CreatedAt = DateTimeOffset.UtcNow,
    }, ct);
    return Results.Ok(created);
})
.WithName("CreateTalkingPoint");

talkingPoints.MapPut("/{id}", async (
    string id,
    UpdateTalkingPointRequest request,
    ITalkingPointRepository repository,
    CancellationToken ct) =>
{
    if (!IsValidScope(request.Scope))
        return Results.BadRequest($"Unknown scope '{request.Scope}'. Expected 'Nord', 'Syd' or 'Both'.");

    var updated = await repository.UpdateAsync(
        id, request.BodyHtml ?? "", request.AssigneeEmail ?? "",
        string.IsNullOrWhiteSpace(request.AssigneeDisplayName) ? request.AssigneeEmail ?? "" : request.AssigneeDisplayName,
        request.Scope, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
})
.WithName("UpdateTalkingPoint");

talkingPoints.MapPost("/{id}/raised", async (
    string id,
    SetTalkingPointRaisedRequest request,
    ITalkingPointRepository repository,
    CancellationToken ct) =>
{
    if (!IsValidScope(request.Team))
        return Results.BadRequest($"Unknown team '{request.Team}'. Expected 'Nord', 'Syd' or 'Both'.");

    var updated = await repository.SetRaisedAsync(id, request.Team, request.Raised, ct);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
})
.WithName("SetTalkingPointRaised");

// The settings modal's "tänd/släck allt" bulk action - lets a mis-clicked round of checkoffs (or a
// deliberate "start the list fresh") be undone in one call instead of one row at a time. Scoped the
// same way as whatever list it was clicked from: "Nord"/"Syd" only touches items relevant to that
// team, "Both" (the "Alla" filter) touches every item's flags for both teams.
talkingPoints.MapPost("/raised-all", async (
    SetAllTalkingPointsRaisedRequest request,
    ITalkingPointRepository repository,
    CancellationToken ct) =>
{
    if (!IsValidScope(request.Team))
        return Results.BadRequest($"Unknown team '{request.Team}'. Expected 'Nord', 'Syd' or 'Both'.");

    await repository.SetAllRaisedAsync(request.Team, request.Raised, ct);
    return Results.Ok();
})
.WithName("SetAllTalkingPointsRaised");

talkingPoints.MapDelete("/{id}", async (
    string id,
    ITalkingPointRepository repository,
    CancellationToken ct) =>
{
    var removed = await repository.DeleteAsync(id, ct);
    return removed ? Results.Ok() : Results.NotFound();
})
.WithName("DeleteTalkingPoint");

// Feeds the sprint picker (the "sp1 · 2026-08-17 – 2026-09-04" text on the daily board, made
// clickable). Rather than every iteration ever created, this is a window of three releases - the
// one `around` sits in, the one before it and the one after - so the list stays short and someone
// can still page a whole release's worth of sprints forwards or backwards from wherever they are.
app.MapGet("/api/sprints", async (
    string team,
    // The iteration to center the window on - normally the sprint currently on screen, so paging
    // from an already-picked sprint slides the window rather than snapping back to today's. Falls
    // back to the same date-based/override pick /api/dailys uses when omitted (the first load).
    string? around,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var iterations = await azureDevOpsService.GetIterationsAsync(developerTeam, ct);
    if (iterations.Count == 0)
        return Results.Ok(Array.Empty<object>());

    // The release a sprint belongs to is its iteration path's parent folder - sprints are always
    // one level under it ("Utveckling\27.1\Sprint 1" -> release folder "Utveckling\27.1").
    static string ReleaseFolderOf(string path)
    {
        var idx = path.LastIndexOf('\\');
        return idx < 0 ? path : path[..idx];
    }

    var releases = iterations
        .GroupBy(s => ReleaseFolderOf(s.Path), StringComparer.OrdinalIgnoreCase)
        .Select(g => new { Folder = g.Key, Sprints = g.OrderBy(s => s.StartDate).ToList() })
        // Ordered by the release's earliest sprint - release folder *names* don't reliably sort
        // chronologically ("26.10" vs "26.2"), but the dates inside always do.
        .OrderBy(r => r.Sprints.Min(s => s.StartDate))
        .ToList();

    var anchor =
        (!string.IsNullOrWhiteSpace(around)
            ? iterations.FirstOrDefault(s => string.Equals(s.Path, around, StringComparison.OrdinalIgnoreCase))
            : null)
        ?? ResolveDefaultSprint(iterations, configuration);

    var anchorIndex = anchor is null ? -1 : releases.FindIndex(r => string.Equals(r.Folder, ReleaseFolderOf(anchor.Path), StringComparison.OrdinalIgnoreCase));
    if (anchorIndex < 0) anchorIndex = 0;

    var windowStart = Math.Max(0, anchorIndex - 1);
    var windowEnd = Math.Min(releases.Count - 1, anchorIndex + 1);

    var result = releases
        .Skip(windowStart)
        .Take(windowEnd - windowStart + 1)
        .SelectMany(r => r.Sprints)
        .Select(s => new
        {
            path = s.Path,
            name = s.Name,
            startDate = s.StartDate.ToString("yyyy-MM-dd"),
            endDate = s.EndDate.ToString("yyyy-MM-dd"),
            isCurrent = s.IsCurrent,
            releaseFolder = ReleaseFolderOf(s.Path),
        })
        .ToList();

    return Results.Ok(result);

    static Sprint? ResolveDefaultSprint(IReadOnlyList<Sprint> iterations, IConfiguration configuration)
    {
        var iterationOverride = configuration["Testing:IterationPathOverride"];
        if (!string.IsNullOrWhiteSpace(iterationOverride))
        {
            var overridden = iterations.FirstOrDefault(
                s => string.Equals(s.Path, iterationOverride, StringComparison.OrdinalIgnoreCase));
            if (overridden is not null) return overridden;
        }

        var today = DateTime.UtcNow.Date;
        return iterations.FirstOrDefault(s => s.StartDate.Date <= today && today <= s.EndDate.Date)
            ?? iterations.OrderBy(s => s.EndDate).FirstOrDefault(s => s.EndDate.Date >= today)
            ?? iterations.LastOrDefault();
    }
})
.WithName("GetSprints");

// The Refinement board's product-backlog team picker - every Azure DevOps team in the project,
// not just the two Scrum teams (Nord/Syd) the rest of the app is scoped to.
app.MapGet("/api/refinement/teams", async (
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var teams = await azureDevOpsService.GetProjectTeamsAsync(ct);
    return Results.Ok(teams);
})
.WithName("GetRefinementTeams");

app.MapGet("/api/refinement/productbacklog", async (
    string? boardTeam,
    string? tag,
    string? iteration,
    string? areaPath,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var team = string.IsNullOrWhiteSpace(boardTeam)
        ? configuration["Refinement:ProductBacklogTeam"] ?? "PO produktstyrning"
        : boardTeam;
    try
    {
        var backlog = await azureDevOpsService.GetProductBacklogAsync(team, tag, iteration, areaPath, ct);
        return Results.Ok(backlog);
    }
    catch (InvalidOperationException ex)
    {
        // "team has no Features board" - a config problem, not a server error.
        return Results.BadRequest(ex.Message);
    }
})
.WithName("GetProductBacklog");

// The Refinement board's other source: a single sprint, refined as a flat Feature/User
// Story/Bug hierarchy rather than the product backlog's swimlanes.
app.MapGet("/api/refinement/sprint", async (
    string team,
    string iteration,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var areaPaths = await azureDevOpsService.GetTeamAreaPathsAsync(developerTeam, ct);
    var backlog = await azureDevOpsService.GetRefinementSprintAsync(iteration, areaPaths, ct);
    return Results.Ok(backlog);
})
.WithName("GetRefinementSprint");

// The Refinement board's third source: every card tagged "Refinement" under the team's area
// paths and under one whole release's iteration tree (e.g. "Utveckling\27.1"), not just one
// exact sprint - a tagged card can sit in any sprint under the release, or in none yet.
app.MapGet("/api/refinement/tagged", async (
    string team,
    string release,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var areaPaths = await azureDevOpsService.GetTeamAreaPathsAsync(developerTeam, ct);
    var backlog = await azureDevOpsService.GetTaggedRefinementItemsAsync(release, areaPaths, "Refinement", ct);
    return Results.Ok(backlog);
})
.WithName("GetRefinementTagged");

// The Refinement board's fourth source: free-text id/title search across the whole project,
// regardless of team/area/iteration - same lookup as the "länka befintligt kort" picker
// (/api/workitems/search), just mapped to the richer ProductBacklogDto shape the Refinement
// board's cards render from.
app.MapGet("/api/refinement/search", async (
    string q,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var backlog = await azureDevOpsService.SearchRefinementItemsAsync(q, ct);
    return Results.Ok(backlog);
})
.WithName("SearchRefinementItems");

// Teamavstämning's Scrum Master step (weeks 2+ of a sprint): work items tagged for both teams at
// once, in whichever sprint is current right now. "Current" is resolved off Team Nord's own
// iteration list - Nord and Syd share the same release/sprint cadence, just different area paths,
// so either team's calendar gives the same answer.
app.MapGet("/api/team-checkin/cross-team-items", async (
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var iterations = await azureDevOpsService.GetIterationsAsync(DeveloperTeam.Nord, ct);
    var current = iterations.FirstOrDefault(i => i.IsCurrent);
    if (current is null)
        return Results.Ok(new { board = (object?)null, featureIds = Array.Empty<int>(), items = Array.Empty<object>() });

    var nordAreas = await azureDevOpsService.GetTeamAreaPathsAsync(DeveloperTeam.Nord, ct);
    var sydAreas = await azureDevOpsService.GetTeamAreaPathsAsync(DeveloperTeam.Syd, ct);
    var areaPaths = nordAreas.Concat(sydAreas).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

    var backlog = await azureDevOpsService.GetTaggedRefinementItemsAsync(current.Path, areaPaths, "Berör både teamen", ct);
    return Results.Ok(backlog);
})
.WithName("GetCrossTeamTaggedItems");

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

// The sprint-goals wiki page changes every sprint - lets it be repointed from the app itself
// instead of editing appsettings.json and restarting. GET returns the effective url (override if
// one's been saved, else the appsettings.json default) so the edit UI can show what's actually in
// use, not just whether an override exists.
app.MapGet("/api/sprint-goals/wiki-url", async (
    string team,
    ISprintGoalsWikiUrlStore store,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'.");

    var url = await store.GetOverrideAsync(developerTeam, ct) ?? configuration[$"PlanningBoard:SprintGoalsWikiUrls:{developerTeam}"] ?? "";
    return Results.Ok(new { team = developerTeam.ToString(), url });
})
.WithName("GetSprintGoalsWikiUrl");

app.MapPost("/api/sprint-goals/wiki-url", async (
    SetSprintGoalsWikiUrlRequest request,
    ISprintGoalsWikiUrlStore store,
    CancellationToken ct) =>
{
    if (!Enum.TryParse<DeveloperTeam>(request.Team, ignoreCase: true, out var developerTeam))
        return Results.BadRequest($"Unknown team '{request.Team}'. Expected 'Nord' or 'Syd'.");
    if (string.IsNullOrWhiteSpace(request.Url))
        return Results.BadRequest("Missing 'url'.");

    await store.SetOverrideAsync(developerTeam, request.Url, ct);
    return Results.Ok();
})
.WithName("SetSprintGoalsWikiUrl");

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
    if (request.IsBlocked.HasValue) fields["Microsoft.VSTS.CMMI.Blocked"] = request.IsBlocked.Value ? "Yes" : "No";
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
    if (request.DoRStatus != null) fields["Custom.DoRStatus"] = request.DoRStatus;
    if (request.DoRDecision != null) fields["Custom.DoRDecision"] = request.DoRDecision;
    if (request.DoRApprovedBy != null) fields["Custom.DoRApprovedBy"] = request.DoRApprovedBy;
    if (request.DoRApprovedDate.HasValue) fields["Custom.DoRApprovedDate"] = request.DoRApprovedDate.Value;
    if (request.DoRRevision.HasValue) fields["Custom.DoRRevision"] = request.DoRRevision.Value;
    // Identity fields - same null-to-clear rule as DevelopmentPartner above.
    if (request.Kandidat1 != null) fields["Custom.Kandidat1"] = string.IsNullOrEmpty(request.Kandidat1) ? null : request.Kandidat1;
    if (request.Kandidat2 != null) fields["Custom.Kandidat2"] = string.IsNullOrEmpty(request.Kandidat2) ? null : request.Kandidat2;
    if (request.Kandidat3 != null) fields["Custom.Kandidat3"] = string.IsNullOrEmpty(request.Kandidat3) ? null : request.Kandidat3;
    if (request.SakkunnigInfo != null) fields["Custom.SakkunnigInfo"] = request.SakkunnigInfo;

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

// "Utse Sakkunnig" on a User Story: a new Story that carries the expert assignment, kept separate
// from the originating card (Related, not Child) so appointing someone doesn't sit on the card's
// own workflow. Title/Area/Iteration are inherited; the checklist becomes that many Task children.
app.MapPost("/api/workitems/{id:int}/sakkunnig", async (
    int id,
    CreateSakkunnigRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.AssignedTo))
        return Results.BadRequest("Välj en sakkunnig först.");

    var source = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (source is null)
        return Results.NotFound();

    var fields = new Dictionary<string, object?>
    {
        ["System.Title"] = $"Sakkunnig_{source.Title}",
        ["System.AreaPath"] = source.AreaPath,
        ["System.IterationPath"] = source.IterationPath,
        ["System.AssignedTo"] = request.AssignedTo,
        ["System.Description"] = request.InfoHtml ?? "",
        ["System.Tags"] = "Sakkunnig",
    };

    var newId = await azureDevOpsService.CreateWorkItemAsync("User Story", fields, id, "System.LinkTypes.Related", ct);

    foreach (var title in request.TaskTitles ?? new List<string>())
    {
        await azureDevOpsService.CreateTaskAsync(
            newId,
            title,
            SakkunnigTaskActivity(title),
            request.AssignedTo,
            "New",
            source.AreaPath,
            source.IterationPath,
            ct);
    }

    return Results.Ok(new { id = newId });

    // The checklist is fixed (see AppointSakkunnigModal), so the Activity mapping can be too -
    // same idea as Behovsbedömning's need-category -> Activity mapping elsewhere in this file.
    static string? SakkunnigTaskActivity(string taskTitle) => taskTitle switch
    {
        "Acceptanstester" => "Testing",
        "Hjälptextkort" => "Documentation",
        "Script vid nyinstallation" => "Deployment",
        _ => null,
    };
})
.WithName("CreateSakkunnigStory");

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
    if (request.StoryPoints.HasValue) fields["Microsoft.VSTS.Scheduling.StoryPoints"] = request.StoryPoints.Value;
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

// "Bryt ut hjälptext" on the Relationer/Taskboard tabs: unlike CreateHelptextStory above, this
// doesn't invent a new Documentation task - it moves the story's *existing* one. The client has
// already identified (or the user has picked, when more than one Documentation task was active)
// which child Task this is; when there wasn't one at all, the client asks first and then posts
// with taskId null so a fresh one gets created directly under the new story, same shape as
// CreateHelptextStory. Either way the new story is assigned to the Task's own owner, not the
// story's developer - whoever already had the documentation work keeps it.
app.MapPost("/api/workitems/{id:int}/helptext-breakout", async (
    int id,
    BreakoutHelpTextRequest request,
    IAzureDevOpsService azureDevOpsService,
    CancellationToken ct) =>
{
    var source = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (source is null)
        return Results.NotFound();

    if (request.TaskId is int existingTaskId)
    {
        var task = await azureDevOpsService.GetWorkItemDetailAsync(existingTaskId, ct);
        if (task is null)
            return Results.NotFound($"Hittade inte task #{existingTaskId}.");
        if (!string.Equals(task.Type, "Task", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest($"#{existingTaskId} är inte en Task.");
        if (task.Parent?.Id != id)
            return Results.BadRequest($"#{existingTaskId} är inte en task under #{id}.");

        var storyId = await azureDevOpsService.CreateRelatedUserStoryAsync(
            id,
            $"Hjälptext – {source.Title}",
            task.AssignedTo,
            source.AreaPath,
            source.IterationPath,
            ct);

        await azureDevOpsService.RemoveWorkItemRelationAsync(existingTaskId, id, "System.LinkTypes.Hierarchy-Reverse", ct);
        await azureDevOpsService.AddWorkItemRelationAsync(existingTaskId, storyId, "System.LinkTypes.Hierarchy-Reverse", ct);

        return Results.Ok(new { storyId, taskId = existingTaskId });
    }
    else
    {
        var storyId = await azureDevOpsService.CreateRelatedUserStoryAsync(
            id,
            $"Hjälptext – {source.Title}",
            null,
            source.AreaPath,
            source.IterationPath,
            ct);
        var taskId = await azureDevOpsService.CreateTaskAsync(
            storyId,
            $"Hjälptext - {source.Title}",
            "Documentation",
            null,
            "New",
            source.AreaPath,
            source.IterationPath,
            ct);

        return Results.Ok(new { storyId, taskId });
    }
})
.WithName("BreakoutHelptext");

// AvekiDokumentation: additive alternative to the "helptext-story" endpoint above. Instead of a
// satellite User Story cluttering this project's board, the card is created directly in the
// Dokumentation project - parented under BESTÄLLNING, exactly like TD already does by hand per the
// wiki's rutin - and Related-linked back here. The source card is never written to beyond that
// mirrored link, so nothing about closing it changes.
app.MapPost("/api/documentation/helptext-tasks", async (
    CreateDocumentationHelpTextTaskRequest request,
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Title))
        return Results.BadRequest("Hjälptextkortet behöver en titel.");
    if (request.RelatedWorkItemId <= 0)
        return Results.BadRequest("Saknar kortet som hjälptexten hör till.");

    var source = await azureDevOpsService.GetWorkItemDetailAsync(request.RelatedWorkItemId, ct);
    if (source is null)
        return Results.NotFound($"Hittade inte #{request.RelatedWorkItemId}.");

    var project = configuration["Documentation:ProjectName"];
    var parentStoryId = configuration.GetValue<int?>("Documentation:BestallningStoryId");
    if (string.IsNullOrWhiteSpace(project) || parentStoryId is null or <= 0)
        return Results.Problem("Documentation:ProjectName/BestallningStoryId saknas i konfigurationen.");

    // Same "Hjälptext - " prefix the wiki's rutin already uses - it's what makes a card
    // recognisable as hjälptext at a glance, and what the list below matches on.
    var title = request.Title.Trim();
    if (!title.StartsWith("Hjälptext", StringComparison.OrdinalIgnoreCase))
        title = $"Hjälptext - {title}";

    var taskId = await azureDevOpsService.CreateCrossProjectHelpTextTaskAsync(
        project,
        parentStoryId.Value,
        title,
        request.DescriptionHtml,
        request.AssignedTo,
        request.RelatedWorkItemId,
        ct);

    var organization = configuration["AzureDevOps:Organization"];
    var webUrl = $"https://dev.azure.com/{organization}/{Uri.EscapeDataString(project)}/_workitems/edit/{taskId}";
    return Results.Ok(new { id = taskId, url = webUrl });
})
.WithName("CreateDocumentationHelpTextTask");

// The list both AvekiDokumentation views read: every hjälptext-Task in the Dokumentation project,
// wherever it came from - the button above, or TD's existing by-hand rutin. Konsult sees the ones
// still open; Dokumentatör sees the ones a konsult closed to mark "klart" - closing the card *is*
// the hand-off, so both views share this one list and split it client-side by state.
app.MapGet("/api/documentation/helptext-tasks", async (
    IAzureDevOpsService azureDevOpsService,
    IConfiguration configuration,
    CancellationToken ct) =>
{
    var project = configuration["Documentation:ProjectName"];
    if (string.IsNullOrWhiteSpace(project))
        return Results.Problem("Documentation:ProjectName saknas i konfigurationen.");

    var safeProject = project.Replace("'", "''");
    var wiql =
        $"SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '{safeProject}' " +
        "AND [System.WorkItemType] = 'Task' AND [System.Title] CONTAINS 'Hjälptext' " +
        "AND [System.State] <> 'Removed' " +
        // Closed included, but only recent ones - years of cards TD already finished and closed
        // long ago (the pre-existing, by-hand rutin) shouldn't flood the "ready for TD" queue.
        "AND ([System.State] <> 'Closed' OR [System.ChangedDate] >= @Today - 120) " +
        "ORDER BY [System.ChangedDate] DESC";

    var ids = await azureDevOpsService.RunWiqlIdsAsync(wiql, ct);
    if (ids.Count == 0)
        return Results.Ok(Array.Empty<object>());

    // The lighter batched shape (WorkItemDto), not a per-row detail fetch: the list only needs to
    // render a row, and a detail fetch (with its Related link) happens once, when a row is opened.
    var items = await azureDevOpsService.GetWorkItemsDetailsAsync(ids.Take(200).ToList(), ct);
    var org = configuration["AzureDevOps:Organization"];
    return Results.Ok(items
        .Select(i => new
        {
            id = i.Id,
            title = i.Title,
            state = i.State,
            tags = i.Tags,
            assignedTo = i.AssignedTo,
            createdDate = i.CreatedDate,
            changedDate = i.ChangedDate,
            webUrl = $"https://dev.azure.com/{org}/{Uri.EscapeDataString(project)}/_workitems/edit/{i.Id}",
        })
        .OrderByDescending(i => i.changedDate)
        .ToList());
})
.WithName("GetDocumentationHelpTextTasks");

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

// Azure Test Plans. The service keeps all Azure URLs and response mapping outside the web layer;
// these project-scoped endpoints expose the same operations to the React app in PAT and Entra modes.
var testPlans = app.MapGroup("/api/test-plans");
testPlans.MapGet("/", async (ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetPlansAsync(ct)));
testPlans.MapPost("/", async (TestPlanWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.CreatePlanAsync(request, ct)));
testPlans.MapPatch("/{planId:int}", async (int planId, TestPlanWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.UpdatePlanAsync(planId, request, ct)));
testPlans.MapGet("/{planId:int}/suites", async (int planId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetSuitesAsync(planId, ct)));
testPlans.MapPost("/{planId:int}/suites", async (int planId, TestSuiteWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.CreateSuiteAsync(planId, request, ct)));
testPlans.MapPatch("/{planId:int}/suites/{suiteId:int}", async (int planId, int suiteId, TestSuiteWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.UpdateSuiteAsync(planId, suiteId, request, ct)));
testPlans.MapGet("/{planId:int}/suites/{suiteId:int}/cases", async (int planId, int suiteId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetSuiteCasesAsync(planId, suiteId, ct)));
testPlans.MapPost("/{planId:int}/suites/{suiteId:int}/cases", async (int planId, int suiteId, TestCaseMembership request, ITestPlansService service, CancellationToken ct) =>
{
    await service.AddCasesAsync(planId, suiteId, request, ct);
    return Results.NoContent();
});
testPlans.MapDelete("/{planId:int}/suites/{suiteId:int}/cases/{caseId:int}", async (int planId, int suiteId, int caseId, ITestPlansService service, CancellationToken ct) =>
{
    await service.RemoveCasesAsync(planId, suiteId, new[] { caseId }, ct);
    return Results.NoContent();
});
testPlans.MapGet("/{planId:int}/suites/{suiteId:int}/points", async (int planId, int suiteId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetPointsAsync(planId, suiteId, ct)));
testPlans.MapPatch("/{planId:int}/suites/{suiteId:int}/points/{pointId:int}/tester", async (int planId, int suiteId, int pointId, AssignTesterRequest request, ITestPlansService service, CancellationToken ct) =>
{
    await service.AssignTesterAsync(planId, suiteId, pointId, request.TesterId, ct);
    return Results.NoContent();
});
testPlans.MapPost("/cases/batch", async (IReadOnlyList<int> caseIds, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetCasesAsync(caseIds, ct)));
testPlans.MapGet("/cases/{caseId:int}/execution", async (int caseId, int? revision, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetExecutionCaseAsync(caseId, revision, ct)));
testPlans.MapGet("/cases/{caseId:int}", async (int caseId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetCaseAsync(caseId, ct)));
testPlans.MapPost("/cases", async (TestCaseWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.CreateCaseAsync(request, ct)));
testPlans.MapPatch("/cases/{caseId:int}", async (int caseId, TestCaseWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.UpdateCaseAsync(caseId, request, ct)));
testPlans.MapGet("/configurations", async (ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetConfigurationsAsync(ct)));
testPlans.MapPost("/configurations", async (TestConfigurationWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.CreateConfigurationAsync(request, ct)));
testPlans.MapPatch("/configurations/{configurationId:int}", async (int configurationId, TestConfigurationWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.UpdateConfigurationAsync(configurationId, request, ct)));
testPlans.MapPost("/runs", async (TestRunWrite request, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.CreateRunAsync(request, ct)));
testPlans.MapGet("/runs/{runId:int}", async (int runId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetRunAsync(runId, ct)));
testPlans.MapGet("/runs/{runId:int}/results", async (int runId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.GetResultsAsync(runId, ct)));
testPlans.MapPatch("/runs/{runId:int}/results", async (int runId, IReadOnlyList<TestResultWrite> request, ITestPlansService service, CancellationToken ct) =>
{
    await service.UpdateResultsAsync(runId, request, ct);
    return Results.NoContent();
});
testPlans.MapPost("/runs/{runId:int}/complete", async (int runId, ITestPlansService service, CancellationToken ct) =>
    Results.Ok(await service.CompleteRunAsync(runId, ct)));
app.Run();

static string FormatDisplayName(string email) => PersonNames.Format(email);

/// <summary>
/// Shared by /api/dailys and /api/dailys/person: resolves the sprint (explicit iteration, sandbox
/// override, or today's date) and applies the same team/PO ownership scoping to the team's work
/// items. Factored out so the person-scoped refresh endpoint can't silently drift from what the
/// full board shows - both call this exact same resolution.
/// </summary>
static async Task<(ScopedTeamData? Data, IResult? Error)> ResolveScopedTeamDataAsync(
    string team,
    string? iteration,
    IAzureDevOpsService azureDevOpsService,
    ITeamRoleProvider teamRoleProvider,
    IConfiguration configuration,
    CancellationToken ct)
{
    if (!Enum.TryParse<DeveloperTeam>(team, ignoreCase: true, out var developerTeam))
        return (null, Results.BadRequest($"Unknown team '{team}'. Expected 'Nord' or 'Syd'."));

    var iterations = await azureDevOpsService.GetIterationsAsync(developerTeam, ct);

    Sprint? selectedSprint;
    if (!string.IsNullOrWhiteSpace(iteration))
    {
        selectedSprint = iterations.FirstOrDefault(
            sprint => string.Equals(sprint.Path, iteration, StringComparison.OrdinalIgnoreCase));
        if (selectedSprint is null)
            return (null, Results.NotFound($"Iteration '{iteration}' was not found among team '{team}''s iterations."));
    }
    else
    {
        // Local testing override: pin the board to a specific iteration instead of the
        // date-based "current sprint" pick, useful in a sandbox project whose sprint dates
        // don't line up with today. Empty/unset falls back to the normal auto-detection.
        var iterationOverride = configuration["Testing:IterationPathOverride"];
        if (!string.IsNullOrWhiteSpace(iterationOverride))
        {
            selectedSprint = iterations.FirstOrDefault(
                sprint => string.Equals(sprint.Path, iterationOverride, StringComparison.OrdinalIgnoreCase));
            if (selectedSprint is null)
                return (null, Results.NotFound(
                    $"Configured Testing:IterationPathOverride '{iterationOverride}' was not found among team '{team}''s iterations."));
        }
        else
        {
            var today = DateTime.UtcNow.Date;
            selectedSprint =
                iterations.FirstOrDefault(sprint => sprint.StartDate.Date <= today && today <= sprint.EndDate.Date)
                ?? iterations.OrderBy(sprint => sprint.EndDate).FirstOrDefault(sprint => sprint.EndDate.Date >= today)
                ?? iterations.LastOrDefault();
        }
    }

    if (selectedSprint is null)
        return (null, Results.NotFound($"No iterations found for team '{team}'."));

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

    return (new ScopedTeamData(developerTeam, selectedSprint, scopedWorkItems, productOwnerStoryIds), null);
}

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

internal sealed record ScopedTeamData(
    DeveloperTeam Team,
    Sprint Sprint,
    List<AvekiScrum.Application.Models.DTOs.Scrum.WorkItemDto> ScopedWorkItems,
    HashSet<int> ProductOwnerStoryIds);

internal sealed record SaveDailyCheckInsRequest(
    string Team,
    string SprintPath,
    string SprintName,
    string Date,
    List<DailyCheckInEntryRequest> Entries);

internal sealed record StoryPointsChangesRequest(List<int> StoryIds, string CutoffUtc);

internal sealed record DailyCheckInEntryRequest(
    string Kind,
    string Key,
    string Label,
    double Score);

internal sealed record CreateTalkingPointRequest(
    string Scope,
    string? BodyHtml,
    string AssigneeEmail,
    string? AssigneeDisplayName,
    string? CreatedByEmail,
    string? CreatedByDisplayName);

internal sealed record UpdateTalkingPointRequest(
    string Scope,
    string? BodyHtml,
    string? AssigneeEmail,
    string? AssigneeDisplayName);

/// <summary>Team is "Nord", "Syd", or "Both" (mark done/reset on both teams' flags at once).</summary>
internal sealed record SetTalkingPointRaisedRequest(string Team, bool Raised);

internal sealed record SetSprintGoalsWikiUrlRequest(string Team, string Url);

internal sealed record SetAllTalkingPointsRaisedRequest(string Team, bool Raised);

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
    bool? IsBlocked,
    double? RemainingWork,
    double? CompletedWork,
    double? OriginalEstimate,
    double? BusinessValue,
    string? ValueArea,
    string? AssignedTeam,
    string? Stakeholders,
    string? Reason,
    // The Godkännande-tab's "Godkänn DoR": written together in one save, same as every other
    // field here - see WorkItemReadyCheckTab. ApprovedDate/Revision come from the client rather
    // than being stamped server-side, same pattern as everything else in this endpoint.
    string? DoRStatus,
    string? DoRDecision,
    string? DoRApprovedBy,
    DateTime? DoRApprovedDate,
    int? DoRRevision,
    // Sakkunnig-kandidater (Feature) - same null-to-clear identity-field rule as DevelopmentPartner.
    string? Kandidat1,
    string? Kandidat2,
    string? Kandidat3,
    string? SakkunnigInfo);

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
    List<string>? Tags,
    double? StoryPoints);

internal sealed record AddCommentRequest(string Text);

internal sealed record RelationRequest(int TargetId, string LinkKind);

/// <summary>AvekiDokumentation's "Beställ hjälptext" form - see the two /api/documentation/... endpoints.</summary>
internal sealed record CreateDocumentationHelpTextTaskRequest(
    /// <summary>The card in Utveckling this help text belongs to. Never modified beyond the
    /// Related link Azure mirrors onto it automatically.</summary>
    int RelatedWorkItemId,
    string Title,
    string? DescriptionHtml,
    string? AssignedTo);

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
        ["Feature"] = new[] { "User Story", "Bug" },
        ["User Story"] = new[] { "Task" },
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

internal sealed record CreateSakkunnigRequest(string AssignedTo, string? InfoHtml, List<string>? TaskTitles);

/// <summary>Null TaskId means "create a new Documentation task" - see the helptext-breakout endpoint.</summary>
internal sealed record BreakoutHelpTextRequest(int? TaskId);

public sealed record AssignTesterRequest(string TesterId);
