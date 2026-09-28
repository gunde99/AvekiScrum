using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Models.DTOs.Scrum.TestPlans;

namespace AvekiScrum.Infrastructure.AzureDevOps;

internal sealed class AzureTestPlansService : ITestPlansService
{
    private const string Api = "api-version=7.1";
    private readonly IAzureDevOpsRestClient _rest;

    public AzureTestPlansService(IAzureDevOpsRestClient rest) => _rest = rest;

    public async Task<IReadOnlyList<TestPlanDto>> GetPlansAsync(CancellationToken ct = default)
    {
        var nodes = await GetAllAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans?includePlanDetails=true&{Api}", ct);
        return nodes.Select(MapPlan).ToList();
    }

    public async Task<TestPlanDto> CreatePlanAsync(TestPlanWrite request, CancellationToken ct = default)
    {
        ValidatePlan(request);
        var json = await _rest.PostJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans?{Api}", PlanPayload(request), ct);
        return MapPlan(ParseObject(json));
    }

    public async Task<TestPlanDto> UpdatePlanAsync(int planId, TestPlanWrite request, CancellationToken ct = default)
    {
        ValidatePlan(request);
        var response = await _rest.PatchJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}?{Api}", PlanPayload(request), ct);
        return MapPlan(ParseObject(response.Body));
    }

    public async Task<IReadOnlyList<TestSuiteDto>> GetSuitesAsync(int planId, CancellationToken ct = default)
    {
        var nodes = await GetAllAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites?asTreeView=true&expand=children&{Api}", ct);
        return nodes.Select(MapSuite).ToList();
    }

    public async Task<TestSuiteDto> CreateSuiteAsync(int planId, TestSuiteWrite request, CancellationToken ct = default)
    {
        ValidateSuite(request);
        var json = await _rest.PostJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites?{Api}", SuitePayload(request), ct);
        return MapSuite(ParseObject(json));
    }

    public async Task<TestSuiteDto> UpdateSuiteAsync(int planId, int suiteId, TestSuiteWrite request, CancellationToken ct = default)
    {
        ValidateSuite(request);
        var response = await _rest.PatchJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites/{suiteId}?{Api}", SuitePayload(request), ct);
        return MapSuite(ParseObject(response.Body));
    }

    public async Task<IReadOnlyList<SuiteTestCaseDto>> GetSuiteCasesAsync(int planId, int suiteId, CancellationToken ct = default)
    {
        var nodes = await GetAllAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites/{suiteId}/testcase?witFields=System.Title&{Api}", ct);
        return nodes.Select(node =>
        {
            var workItem = node["workItem"] as JsonObject ?? node;
            return new SuiteTestCaseDto(
                Int(workItem, "id"), Text(workItem, "name", Text(workItem, "title")),
                AssignmentConfigurations(node["pointAssignments"]),
                Refs(node["pointAssignments"], "tester"));
        }).ToList();
    }

    public async Task<TestCaseDto> GetCaseAsync(int caseId, CancellationToken ct = default)
        => MapCase(ParseObject(await _rest.GetStringAsync($"{AzureUrlHelper.BaseUrl}_apis/wit/workitems/{caseId}?$expand=all&{Api}", ct)));

    public async Task<IReadOnlyList<TestCaseDto>> GetCasesAsync(IReadOnlyList<int> caseIds, CancellationToken ct = default)
    {
        var result = new List<TestCaseDto>();
        foreach (var ids in caseIds.Where(id => id > 0).Distinct().Chunk(200))
        {
            var json = await _rest.PostJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/wit/workitemsbatch?{Api}", new
            {
                ids,
                fields = new[]
                {
                    "System.Title", "System.State", "System.AreaPath", "System.IterationPath",
                    "System.AssignedTo", "Microsoft.VSTS.Common.Priority", "Microsoft.VSTS.TCM.AutomationStatus"
                },
                errorPolicy = "Omit"
            }, ct);
            result.AddRange(ParseItems(json).Select(MapCase));
        }
        return result;
    }

    public async Task<TestExecutionCaseDto> GetExecutionCaseAsync(int caseId, int? revision = null, CancellationToken ct = default)
    {
        var suffix = revision is > 0 ? $"/revisions/{revision.Value}" : "";
        var item = ParseObject(await _rest.GetStringAsync(
            $"{AzureUrlHelper.BaseUrl}_apis/wit/workitems/{caseId}{suffix}?$expand=all&{Api}", ct));
        var testCase = MapCase(item);
        var fields = item["fields"] as JsonObject ?? new JsonObject();
        var xml = NullableText(fields, "Microsoft.VSTS.TCM.Steps");
        var expanded = new List<TestExecutionStepDto>();
        var warning = await ExpandExecutionStepsAsync(xml, expanded, "", "", null, 0, ct);
        if (!string.IsNullOrWhiteSpace(NullableText(fields, "Microsoft.VSTS.TCM.LocalDataSource")))
            warning = JoinWarning(warning, "Testfallet använder parametrar. Kontrollera parametervärdena i Azure DevOps innan körning.");
        return new TestExecutionCaseDto(testCase, expanded, warning);
    }

    public async Task<TestCaseDto> CreateCaseAsync(TestCaseWrite request, CancellationToken ct = default)
    {
        ValidateCase(request);
        var response = await _rest.PostJsonPatchAsync(
            $"{AzureUrlHelper.BaseUrl}_apis/wit/workitems/$Test%20Case?{Api}", CasePatch(request, false), ct);
        return MapCase(ParseObject(response.Body));
    }

    public async Task<TestCaseDto> UpdateCaseAsync(int caseId, TestCaseWrite request, CancellationToken ct = default)
    {
        ValidateCase(request);
        var current = ParseObject(await _rest.GetStringAsync($"{AzureUrlHelper.BaseUrl}_apis/wit/workitems/{caseId}?{Api}", ct));
        var currentSteps = NullableText(current["fields"] as JsonObject, "Microsoft.VSTS.TCM.Steps");
        if (currentSteps?.Contains("<compref", StringComparison.OrdinalIgnoreCase) == true)
            throw new InvalidOperationException("Testfallet innehåller Shared Steps och kan ännu inte redigeras säkert i appen. Öppna det i Azure DevOps.");
        var response = await _rest.PatchJsonPatchAsync(
            $"{AzureUrlHelper.BaseUrl}_apis/wit/workitems/{caseId}?{Api}", CasePatch(request, true), ct);
        return MapCase(ParseObject(response.Body));
    }

    public async Task AddCasesAsync(int planId, int suiteId, TestCaseMembership request, CancellationToken ct = default)
    {
        if (request.CaseIds.Count == 0) return;
        var configurationIds = request.ConfigurationIds?.Where(id => id > 0).Distinct().ToArray() ?? Array.Empty<int>();
        if (configurationIds.Length == 0)
        {
            var suites = FlattenSuites(await GetSuitesAsync(planId, ct));
            configurationIds = suites.FirstOrDefault(item => item.Id == suiteId)?.DefaultConfigurations.Select(item => item.Id).ToArray()
                ?? Array.Empty<int>();
        }
        if (configurationIds.Length == 0)
        {
            var configurations = await GetConfigurationsAsync(ct);
            var fallback = configurations.FirstOrDefault(item => item.IsDefault)
                ?? configurations.FirstOrDefault(item => string.Equals(item.State, "active", StringComparison.OrdinalIgnoreCase));
            if (fallback is not null) configurationIds = new[] { fallback.Id };
        }
        if (configurationIds.Length == 0)
            throw new InvalidOperationException("Ingen aktiv testkonfiguration finns i Azure DevOps-projektet.");
        var assignments = configurationIds.Select(id => new { configurationId = id }).ToArray();
        var body = request.CaseIds.Select(id => new { workItem = new { id }, pointAssignments = assignments }).ToArray();
        await _rest.PostJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites/{suiteId}/testcase?{Api}", body, ct);
    }

    public async Task RemoveCasesAsync(int planId, int suiteId, IReadOnlyList<int> caseIds, CancellationToken ct = default)
    {
        if (caseIds.Count == 0) return;
        var ids = string.Join(",", caseIds.Distinct());
        if (!await _rest.DeleteAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites/{suiteId}/testcase/{ids}?{Api}", ct: ct))
            throw new InvalidOperationException("Azure DevOps kunde inte ta bort testfallen från sviten.");
    }

    public async Task<IReadOnlyList<TestPointDto>> GetPointsAsync(int planId, int suiteId, CancellationToken ct = default)
    {
        var nodes = await GetAllAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites/{suiteId}/testpoint?includePointDetails=true&returnIdentityRef=true&{Api}", ct);
        return nodes.Select(node =>
        {
            var results = node["results"] as JsonObject;
            return new TestPointDto(
                Int(node, "id"), Ref(node["testCaseReference"] ?? node["testCase"]), Ref(node["configuration"]),
                Text(node, "outcome", Text(results, "outcome", "Not run")), Text(node, "state", "Ready"),
                Identity(node["tester"]), NullableInt(results, "lastTestRunId"), NullableInt(results, "lastResultId"));
        }).ToList();
    }

    public async Task AssignTesterAsync(int planId, int suiteId, int pointId, string testerId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(testerId)) throw new ArgumentException("Testarens identitet krävs.", nameof(testerId));
        var body = new[] { new { id = pointId, tester = new { id = testerId.Trim() } } };
        await _rest.PatchJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/plans/{planId}/suites/{suiteId}/testpoint?{Api}", body, ct);
    }

    public async Task<IReadOnlyList<TestConfigurationDto>> GetConfigurationsAsync(CancellationToken ct = default)
    {
        var nodes = await GetAllAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/configurations?{Api}", ct);
        return nodes.Select(MapConfiguration).ToList();
    }

    public async Task<TestConfigurationDto> CreateConfigurationAsync(TestConfigurationWrite request, CancellationToken ct = default)
    {
        ValidateName(request.Name, nameof(request.Name));
        var json = await _rest.PostJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/configurations?{Api}", ConfigurationPayload(request), ct);
        return MapConfiguration(ParseObject(json));
    }

    public async Task<TestConfigurationDto> UpdateConfigurationAsync(int configurationId, TestConfigurationWrite request, CancellationToken ct = default)
    {
        ValidateName(request.Name, nameof(request.Name));
        var response = await _rest.PatchJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/testplan/configurations/{configurationId}?{Api}", ConfigurationPayload(request), ct);
        return MapConfiguration(ParseObject(response.Body));
    }

    public async Task<TestRunDto> CreateRunAsync(TestRunWrite request, CancellationToken ct = default)
    {
        ValidateName(request.Name, nameof(request.Name));
        if (request.PointIds.Count == 0) throw new ArgumentException("Minst en testpunkt krävs.", nameof(request.PointIds));
        var body = new { name = request.Name.Trim(), plan = new { id = request.PlanId.ToString(CultureInfo.InvariantCulture) }, pointIds = request.PointIds, comment = request.Comment };
        var json = await _rest.PostJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/test/runs?{Api}", body, ct);
        return MapRun(ParseObject(json));
    }

    public async Task<TestRunDto> GetRunAsync(int runId, CancellationToken ct = default)
        => MapRun(ParseObject(await _rest.GetStringAsync($"{AzureUrlHelper.BaseUrl}_apis/test/runs/{runId}?{Api}", ct)));

    public async Task<IReadOnlyList<TestResultDto>> GetResultsAsync(int runId, CancellationToken ct = default)
    {
        var nodes = await GetAllAsync($"{AzureUrlHelper.BaseUrl}_apis/test/runs/{runId}/results?detailsToInclude=Iterations&{Api}", ct);
        return nodes.Select(MapResult).ToList();
    }

    public async Task UpdateResultsAsync(int runId, IReadOnlyList<TestResultWrite> results, CancellationToken ct = default)
    {
        if (results.Count == 0) return;
        var run = await GetRunAsync(runId, ct);
        if (string.Equals(run.State, "Completed", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("En slutförd testkörning är skrivskyddad.");

        var existingIds = (await GetResultsAsync(runId, ct)).Select(result => result.Id).ToHashSet();
        if (results.Any(result => !existingIds.Contains(result.Id)))
            throw new InvalidOperationException("Ett resultat tillhör inte den angivna testkörningen.");

        var body = results.Select(result => new
        {
            id = result.Id,
            outcome = result.Outcome,
            state = result.State,
            comment = result.Comment,
            failureType = result.FailureType,
            associatedBugs = result.AssociatedBugIds?.Select(id => new { id }).ToArray(),
            iterationDetails = result.ActionResults is { Count: > 0 }
                ? new[]
                {
                    new
                    {
                        id = 1,
                        outcome = result.Outcome,
                        actionResults = result.ActionResults.Select(action => new
                        {
                            actionPath = action.ActionPath,
                            stepIdentifier = action.StepIdentifier,
                            iterationId = 1,
                            outcome = action.Outcome,
                            comment = action.Comment
                        }).ToArray()
                    }
                }
                : null
        }).ToArray();
        await _rest.PatchJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/test/runs/{runId}/results?{Api}", body, ct);
    }

    public async Task<TestRunDto> CompleteRunAsync(int runId, CancellationToken ct = default)
    {
        var response = await _rest.PatchJsonAsync($"{AzureUrlHelper.BaseUrl}_apis/test/runs/{runId}?{Api}", new { state = "Completed", completedDate = DateTimeOffset.UtcNow }, ct);
        return MapRun(ParseObject(response.Body));
    }

    private async Task<List<JsonObject>> GetAllAsync(string firstUrl, CancellationToken ct)
    {
        var result = new List<JsonObject>();
        var url = firstUrl;
        while (true)
        {
            var response = await _rest.GetAsync(url, ct);
            result.AddRange(ParseItems(response.Body));
            if (string.IsNullOrWhiteSpace(response.ContinuationToken)) break;
            url = firstUrl + (firstUrl.Contains('?') ? "&" : "?") + "continuationToken=" + Uri.EscapeDataString(response.ContinuationToken);
        }
        return result;
    }

    private static object PlanPayload(TestPlanWrite r) => Clean(new Dictionary<string, object?>
    {
        ["name"] = r.Name.Trim(), ["areaPath"] = r.AreaPath, ["iteration"] = r.Iteration,
        ["description"] = r.Description, ["state"] = r.State, ["startDate"] = r.StartDate,
        ["endDate"] = r.EndDate, ["revision"] = r.Revision
    });

    private static object SuitePayload(TestSuiteWrite r) => Clean(new Dictionary<string, object?>
    {
        ["name"] = r.Name.Trim(), ["suiteType"] = r.SuiteType,
        ["parentSuite"] = r.ParentSuiteId.HasValue ? new { id = r.ParentSuiteId.Value } : null,
        ["requirementId"] = r.RequirementId, ["queryString"] = r.QueryString,
        ["inheritDefaultConfigurations"] = r.InheritDefaultConfigurations,
        ["defaultConfigurations"] = r.DefaultConfigurationIds?.Select(id => new { id }).ToArray(),
        ["revision"] = r.Revision
    });

    private static object ConfigurationPayload(TestConfigurationWrite r) => Clean(new Dictionary<string, object?>
    {
        ["name"] = r.Name.Trim(), ["state"] = r.State, ["description"] = r.Description,
        ["values"] = r.Values?.Select(pair => new { name = pair.Key, value = pair.Value }).ToArray(), ["revision"] = r.Revision
    });

    private static Dictionary<string, object?> Clean(Dictionary<string, object?> values)
    {
        foreach (var key in values.Where(pair => pair.Value is null).Select(pair => pair.Key).ToArray()) values.Remove(key);
        return values;
    }
    private static object[] CasePatch(TestCaseWrite r, bool updating)
    {
        var operations = new List<object>();
        if (updating && r.Revision.HasValue) operations.Add(Op("test", "/rev", r.Revision.Value));
        operations.Add(Op("add", "/fields/System.Title", r.Title.Trim()));
        operations.Add(Op("add", "/fields/System.State", r.State));
        operations.Add(Op("add", "/fields/System.AreaPath", r.AreaPath));
        operations.Add(Op("add", "/fields/System.IterationPath", r.IterationPath));
        operations.Add(Op("add", "/fields/Microsoft.VSTS.Common.Priority", r.Priority));
        operations.Add(Op("add", "/fields/Microsoft.VSTS.TCM.Steps", StepsXml(r.Steps)));
        if (!string.IsNullOrWhiteSpace(r.AssignedTo)) operations.Add(Op("add", "/fields/System.AssignedTo", r.AssignedTo));
        return operations.ToArray();
    }

    private static object Op(string op, string path, object value) => new { op, path, value };

    private static string StepsXml(IReadOnlyList<TestStepDto> steps)
    {
        var root = new XElement("steps", new XAttribute("id", "0"), new XAttribute("last", steps.Count));
        var next = 1;
        foreach (var step in steps)
        {
            var id = step.Id > 0 ? step.Id : next;
            next = Math.Max(next, id + 1);
            root.Add(new XElement("step", new XAttribute("id", id), new XAttribute("type", "ActionStep"),
                new XElement("parameterizedString", new XAttribute("isformatted", "true"), step.ActionHtml ?? ""),
                new XElement("parameterizedString", new XAttribute("isformatted", "true"), step.ExpectedHtml ?? ""),
                new XElement("description")));
        }
        root.SetAttributeValue("last", Math.Max(0, next - 1));
        return root.ToString(SaveOptions.DisableFormatting);
    }

    private static IReadOnlyList<TestStepDto> ParseSteps(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml)) return Array.Empty<TestStepDto>();
        try
        {
            return XDocument.Parse(xml).Descendants("step").Select(step =>
            {
                var fields = step.Elements("parameterizedString").ToArray();
                return new TestStepDto((int?)step.Attribute("id") ?? 0, fields.ElementAtOrDefault(0)?.Value ?? "", fields.ElementAtOrDefault(1)?.Value ?? "");
            }).ToList();
        }
        catch (System.Xml.XmlException) { return Array.Empty<TestStepDto>(); }
    }

    private async Task<string?> ExpandExecutionStepsAsync(
        string? xml, List<TestExecutionStepDto> result, string pathPrefix,
        string identifierPrefix, string? sharedTitle, int depth, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(xml)) return null;
        if (depth > 8) return "Kedjan av Shared Steps är för djup för att visas säkert.";
        XDocument document;
        try { document = XDocument.Parse(xml); }
        catch (System.Xml.XmlException) { return "Teststegen har ett format som appen inte kan läsa."; }

        var ordinal = 0;
        string? warning = null;
        foreach (var element in document.Root?.Elements() ?? Enumerable.Empty<XElement>())
        {
            ordinal++;
            var id = (int?)element.Attribute("id") ?? ordinal + 1;
            var actionPath = pathPrefix + id.ToString("x8", CultureInfo.InvariantCulture);
            var identifier = string.IsNullOrEmpty(identifierPrefix)
                ? ordinal.ToString(CultureInfo.InvariantCulture)
                : identifierPrefix + ";" + ordinal.ToString(CultureInfo.InvariantCulture);
            if (element.Name.LocalName.Equals("compref", StringComparison.OrdinalIgnoreCase))
            {
                var reference = (int?)element.Attribute("ref");
                if (reference is null) { warning = JoinWarning(warning, "En Shared Steps-referens saknar ID."); continue; }
                var shared = ParseObject(await _rest.GetStringAsync(
                    $"{AzureUrlHelper.BaseUrl}_apis/wit/workitems/{reference.Value}?$expand=all&{Api}", ct));
                var sharedFields = shared["fields"] as JsonObject ?? new JsonObject();
                var childWarning = await ExpandExecutionStepsAsync(
                    NullableText(sharedFields, "Microsoft.VSTS.TCM.Steps"), result, actionPath,
                    identifier, Text(sharedFields, "System.Title", $"Shared Steps #{reference.Value}"), depth + 1, ct);
                warning = JoinWarning(warning, childWarning);
                continue;
            }

            if (!element.Name.LocalName.Equals("step", StringComparison.OrdinalIgnoreCase)) continue;
            var values = element.Elements("parameterizedString").ToArray();
            result.Add(new TestExecutionStepDto(
                actionPath, identifier, values.ElementAtOrDefault(0)?.Value ?? "",
                values.ElementAtOrDefault(1)?.Value ?? "", sharedTitle));
        }
        return warning;
    }

    private static string? JoinWarning(string? first, string? second) =>
        string.IsNullOrWhiteSpace(second) ? first : string.IsNullOrWhiteSpace(first) ? second : first + " " + second;

    private static TestPlanDto MapPlan(JsonObject o) => new(
        Int(o, "id"), Text(o, "name"), NullableText(o, "description"), Text(o, "state"),
        Text(o, "areaPath"), Text(o, "iteration"), Int(o, "revision"), Date(o, "startDate"), Date(o, "endDate"),
        o["rootSuite"] is null ? null : Ref(o["rootSuite"]));

    private static TestSuiteDto MapSuite(JsonObject o) => new(
        Int(o, "id"), Text(o, "name"), Text(o, "suiteType"), Int(o, "revision"),
        o["parentSuite"] is null ? null : Ref(o["parentSuite"]), Refs(o["defaultConfigurations"]),
        Bool(o, "inheritDefaultConfigurations"), Bool(o, "hasChildren"),
        Items(o["children"]).Select(MapSuite).ToList());

    private static TestCaseDto MapCase(JsonObject o)
    {
        var f = o["fields"] as JsonObject ?? new JsonObject();
        return new TestCaseDto(Int(o, "id"), Int(o, "rev"), Text(f, "System.Title"), Text(f, "System.State"),
            Text(f, "System.AreaPath"), Text(f, "System.IterationPath"), Int(f, "Microsoft.VSTS.Common.Priority", 2),
            Identity(f["System.AssignedTo"]), NullableText(f, "Microsoft.VSTS.TCM.AutomationStatus"),
            ParseSteps(NullableText(f, "Microsoft.VSTS.TCM.Steps")),
            o["_links"]?["html"]?["href"]?.GetValue<string>());
    }

    private static TestConfigurationDto MapConfiguration(JsonObject o) => new(
        Int(o, "id"), Text(o, "name"), Text(o, "state"), NullableText(o, "description"), Int(o, "revision"), Bool(o, "isDefault"));

    private static TestRunDto MapRun(JsonObject o) => new(
        Int(o, "id"), Text(o, "name"), Text(o, "state"), Bool(o, "isAutomated"),
        Date(o, "startedDate"), Date(o, "completedDate"), o["webAccessUrl"]?.GetValue<string>());

    private static TestResultDto MapResult(JsonObject o) => new(
        Int(o, "id"), Text(o, "outcome"), Text(o, "state"), NullableText(o, "comment"),
        NullableInt(o["testCase"] as JsonObject, "id"), NullableInt(o["testPoint"] as JsonObject, "id"),
        NullableInt(o, "testCaseRevision"), Date(o, "completedDate"), Identity(o["tester"]),
        Items(o["iterationDetails"]).SelectMany(iteration => Items(iteration["actionResults"]))
            .Select(action => new TestActionResultDto(
                Text(action, "actionPath"), Text(action, "stepIdentifier"),
                Text(action, "outcome"), NullableText(action, "comment"))).ToList());

    private static JsonObject ParseObject(string json) => JsonNode.Parse(json) as JsonObject
        ?? throw new InvalidOperationException("Azure DevOps returnerade ett oväntat JSON-format.");
    private static IEnumerable<JsonObject> ParseItems(string json)
    {
        var root = JsonNode.Parse(json);
        return Items(root is JsonObject o && o["value"] is not null ? o["value"] : root);
    }
    private static IEnumerable<JsonObject> Items(JsonNode? node) => node switch
    {
        JsonArray a => a.OfType<JsonObject>(), JsonObject o => new[] { o }, _ => Array.Empty<JsonObject>()
    };
    private static IEnumerable<TestSuiteDto> FlattenSuites(IEnumerable<TestSuiteDto> suites) =>
        suites.SelectMany(suite => new[] { suite }.Concat(FlattenSuites(suite.Children)));
    private static IReadOnlyList<TestPlanReferenceDto> AssignmentConfigurations(JsonNode? node) => Items(node)
        .Select(item => new TestPlanReferenceDto(Int(item, "configurationId"), Text(item, "configurationName")))
        .Where(item => item.Id > 0).GroupBy(item => item.Id).Select(group => group.First()).ToList();    private static IReadOnlyList<TestPlanReferenceDto> Refs(JsonNode? node, string? child = null) => Items(node)
        .Select(o => child is null ? (JsonNode?)o : o[child]).Where(n => n is not null).Select(Ref).GroupBy(r => r.Id).Select(g => g.First()).ToList();
    private static TestPlanReferenceDto Ref(JsonNode? node)
    {
        var o = node as JsonObject;
        return new TestPlanReferenceDto(Int(o, "id"), Text(o, "name", Text(o, "title")));
    }
    private static string? Identity(JsonNode? node) => node switch
    {
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        JsonObject o => MeaningfulIdentity(o),
        _ => null
    };
    private static string? MeaningfulIdentity(JsonObject o)
    {
        var value = NullableText(o, "displayName") ?? NullableText(o, "uniqueName") ?? NullableText(o, "id");
        return Guid.TryParse(value, out var id) && id == Guid.Empty ? null : value;
    }
    private static string Text(JsonObject? o, string name, string fallback = "") => NullableText(o, name) ?? fallback;
    private static string? NullableText(JsonObject? o, string name) => o?[name] switch
    {
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        JsonValue v => v.ToJsonString().Trim('"'), _ => null
    };
    private static int Int(JsonObject? o, string name, int fallback = 0) => NullableInt(o, name) ?? fallback;
    private static int? NullableInt(JsonObject? o, string name) => o?[name] switch
    {
        JsonValue v when v.TryGetValue<int>(out var i) => i,
        JsonValue v when v.TryGetValue<long>(out var l) => checked((int)l),
        JsonValue v when v.TryGetValue<string>(out var s) && int.TryParse(s, out var i) => i,
        _ => null
    };
    private static bool Bool(JsonObject? o, string name) => o?[name] is JsonValue v && v.TryGetValue<bool>(out var b) && b;
    private static DateTimeOffset? Date(JsonObject? o, string name) => DateTimeOffset.TryParse(NullableText(o, name), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var d) ? d : null;
    private static void ValidateName(string name, string parameter) { if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Namn krävs.", parameter); }
    private static void ValidatePlan(TestPlanWrite r) { ValidateName(r.Name, nameof(r.Name)); ValidateName(r.AreaPath, nameof(r.AreaPath)); ValidateName(r.Iteration, nameof(r.Iteration)); }
    private static void ValidateSuite(TestSuiteWrite r) => ValidateName(r.Name, nameof(r.Name));
    private static void ValidateCase(TestCaseWrite r) { ValidateName(r.Title, nameof(r.Title)); ValidateName(r.AreaPath, nameof(r.AreaPath)); ValidateName(r.IterationPath, nameof(r.IterationPath)); }
}




