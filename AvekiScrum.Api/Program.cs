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

var pat = builder.Configuration["AzureDevOps:PAT"];
if (string.IsNullOrWhiteSpace(pat))
{
    app.Logger.LogWarning(
        "AzureDevOps:PAT is not set. Set the AzureDevOps__PAT environment variable " +
        "(same one WorkOrganizer uses) before calling any /api endpoint.");
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

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

    var (id, proxyUrl) = await azureDevOpsService.UploadWorkItemAttachmentAsync(buffer.ToArray(), fileName, contentType, ct);
    return Results.Ok(new { id, url = proxyUrl });
})
.WithName("UploadAttachment");

app.Run();

static string FormatDisplayName(string email) => PersonNames.Format(email);

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
