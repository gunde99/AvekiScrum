using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Boards.Dailys;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps;
using AvekiScrum.Infrastructure.Configuration;
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
    // Stakeholders is an identity field, so an empty string has to become a real null to clear it.
    if (request.Stakeholders != null)
        fields["Custom.Stakeholders"] = string.IsNullOrEmpty(request.Stakeholders) ? null : request.Stakeholders;

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

    var linkRel = request.LinkKind?.Trim().ToLowerInvariant() switch
    {
        "child" => "System.LinkTypes.Hierarchy-Reverse",
        "related" => "System.LinkTypes.Related",
        _ => null,
    };
    if (linkRel is null)
        return Results.BadRequest("linkKind must be 'child' or 'related'.");

    var source = await azureDevOpsService.GetWorkItemDetailAsync(id, ct);
    if (source is null)
        return Results.NotFound();

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

static string FormatDisplayName(string email)
{
    var local = email.Split('@')[0];
    var parts = local.Split('.', StringSplitOptions.RemoveEmptyEntries);
    return string.Join(" ", parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
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

internal sealed record NewTaskRequest(string Title, string? Activity, string? AssignedTo, string? State);

internal sealed record CreateTasksRequest(List<NewTaskRequest> Tasks);
