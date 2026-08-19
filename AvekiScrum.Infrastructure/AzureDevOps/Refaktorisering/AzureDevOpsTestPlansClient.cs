using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal sealed class AzureDevOpsTestPlansClient : IAzureDevOpsTestPlansClient
    {
        private const int PageSize = 200;
        private readonly IAzureDevOpsRestClient _rest;
        private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new(System.Text.Json.JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };

        public AzureDevOpsTestPlansClient(IAzureDevOpsRestClient rest)
        {
            _rest = rest;
        }

        public async Task<TestPlanProgressDto> GetTestPlanProgressAsync(
            string sheetId,
            int planId,
            int suiteId,
            CancellationToken ct = default)
        {
            var points = await GetSuitePointsAsync(planId, suiteId, isRecursive: true, ct).ConfigureAwait(false);
            if (points.Count == 0)
            {
                var targetSuites = await GetSuiteAndChildrenAsync(planId, suiteId, ct).ConfigureAwait(false);
                points.AddRange(await GetPointsForSuitesAsync(planId, targetSuites, ct).ConfigureAwait(false));
            }

            return ToProgress(sheetId, planId, suiteId, string.Empty, points);
        }

        public async Task<TestPlanProgressDto> GetTestPlanProgressBySuiteNameAsync(
            string sheetId,
            int planId,
            string suiteName,
            CancellationToken ct = default)
        {
            var suites = await GetSuitesAsync(planId, ct).ConfigureAwait(false);
            var rootSuite = FlattenSuites(suites)
                .FirstOrDefault(suite => string.Equals(suite.Name, suiteName, StringComparison.OrdinalIgnoreCase));

            if (rootSuite == null)
                return new TestPlanProgressDto { SheetId = sheetId, PlanId = planId };

            var points = await GetSuitePointsAsync(planId, rootSuite.Id, isRecursive: true, ct).ConfigureAwait(false);

            if (points.Count == 0)
            {
                var targetSuites = await ExpandSuiteTreeAsync(planId, rootSuite, ct).ConfigureAwait(false);
                points.AddRange(await GetPointsForSuitesAsync(planId, targetSuites, ct).ConfigureAwait(false));
            }

            return ToProgress(sheetId, planId, rootSuite.Id, rootSuite.Name ?? string.Empty, points);
        }

        private async Task<List<TestPointDto>> GetPointsForSuitesAsync(
            int planId,
            IEnumerable<TestSuiteDto> suites,
            CancellationToken ct)
        {
            var points = new List<TestPointDto>();
            var targetSuites = suites
                .Where(suite => suite.Id > 0)
                .GroupBy(suite => suite.Id)
                .Select(group => group.First())
                .ToList();

            foreach (var suite in targetSuites)
            {
                var suitePoints = await GetSuitePointsLegacyAsync(
                    planId,
                    suite.Id,
                    suite.Name ?? string.Empty,
                    ct).ConfigureAwait(false);

                points.AddRange(suitePoints);
            }

            return points;
        }

        private async Task<List<TestSuiteDto>> GetSuiteAndChildrenAsync(
            int planId,
            int suiteId,
            CancellationToken ct)
        {
            var rootSuite = await GetSuiteAsync(planId, suiteId, ct).ConfigureAwait(false);

            if (rootSuite == null)
            {
                var suites = await GetSuitesAsync(planId, ct).ConfigureAwait(false);
                rootSuite = FlattenSuites(suites).FirstOrDefault(suite => suite.Id == suiteId);
            }

            if (rootSuite == null)
                return new List<TestSuiteDto> { new() { Id = suiteId } };

            return await ExpandSuiteTreeAsync(planId, rootSuite, ct).ConfigureAwait(false);
        }

        private async Task<List<TestSuiteDto>> ExpandSuiteTreeAsync(
            int planId,
            TestSuiteDto rootSuite,
            CancellationToken ct)
        {
            await PopulateMissingChildrenAsync(planId, rootSuite, ct).ConfigureAwait(false);

            return FlattenSuites(new[] { rootSuite })
                    .Where(suite => suite.Id > 0)
                    .ToList();
        }

        private async Task PopulateMissingChildrenAsync(
            int planId,
            TestSuiteDto suite,
            CancellationToken ct)
        {
            if (suite.HasChildren && (suite.Children == null || suite.Children.Count == 0))
            {
                var expanded = await GetSuiteAsync(planId, suite.Id, ct).ConfigureAwait(false);
                if (expanded?.Children?.Count > 0)
                    suite.Children = expanded.Children;
            }

            foreach (var child in suite.Children ?? new List<TestSuiteDto>())
                await PopulateMissingChildrenAsync(planId, child, ct).ConfigureAwait(false);
        }

        private async Task<List<TestPointDto>> GetSuitePointsAsync(
            int planId,
            int suiteId,
            bool isRecursive,
            CancellationToken ct)
        {
            var points = new List<TestPointDto>();
            var continuationToken = string.Empty;

            while (true)
            {
                var url = AzureUrlHelper.GetTestPlanPointsUrl(planId, suiteId, continuationToken, isRecursive);
                var response = await _rest.GetAsync(url, ct).ConfigureAwait(false);
                var page = DeserializeTestPointsPage(response.Body, url);
                var values = page?.Value ?? new List<TestPointDto>();
                points.AddRange(values);

                if (string.IsNullOrWhiteSpace(response.ContinuationToken))
                    break;

                continuationToken = response.ContinuationToken;
            }

            return points;
        }

        private async Task<List<TestPointDto>> GetSuitePointsLegacyAsync(
            int planId,
            int suiteId,
            string suiteName,
            CancellationToken ct)
        {
            var points = new List<TestPointDto>();
            var skip = 0;

            while (true)
            {
                var url = AzureUrlHelper.GetTestPlanPointsUrl(planId, suiteId, skip, PageSize);
                var page = await _rest.GetJsonAsync<TestPointsPageDto>(url, ct).ConfigureAwait(false);
                var values = page?.Value ?? new List<TestPointDto>();

                foreach (var point in values)
                    point.SuiteNameOverride = suiteName;

                points.AddRange(values);

                if (values.Count < PageSize)
                    break;

                skip += PageSize;
            }

            return points;
        }

        private static TestPointsPageDto? DeserializeTestPointsPage(string json, string url)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new TestPointsPageDto();

            try
            {
                return JsonSerializer.Deserialize<TestPointsPageDto>(json, JsonOptions);
            }
            catch (JsonException ex)
            {
                var preview = json.Length <= 500 ? json : json[..500];
                throw new InvalidOperationException(
                    $"Kunde inte tolka Azure Test Plans-responsen for {url}. Body start: {preview}",
                    ex);
            }
        }

        private async Task<List<TestSuiteDto>> GetSuitesAsync(int planId, CancellationToken ct)
        {
            var url = AzureUrlHelper.GetTestPlanSuitesUrl(planId);
            var page = await _rest.GetJsonAsync<TestSuitesPageDto>(url, ct).ConfigureAwait(false);
            return page?.Value ?? new List<TestSuiteDto>();
        }

        private async Task<TestSuiteDto?> GetSuiteAsync(int planId, int suiteId, CancellationToken ct)
        {
            var url = AzureUrlHelper.GetTestPlanSuiteUrl(planId, suiteId);
            return await _rest.GetJsonAsync<TestSuiteDto>(url, ct).ConfigureAwait(false);
        }

        private static IEnumerable<TestSuiteDto> FlattenSuites(IEnumerable<TestSuiteDto> suites)
        {
            foreach (var suite in suites)
            {
                yield return suite;

                foreach (var child in FlattenSuites(suite.Children ?? new List<TestSuiteDto>()))
                    yield return child;
            }
        }

        private static TestPlanProgressDto ToProgress(
            string sheetId,
            int planId,
            int suiteId,
            string suiteName,
            IReadOnlyList<TestPointDto> points)
        {
            var outcomes = points
                .Select(point => NormalizeOutcome(point.OutcomeValue))
                .GroupBy(outcome => outcome, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

            var notRun = outcomes.TryGetValue("Not run", out var nr) ? nr : 0;
            var passed = outcomes.TryGetValue("Passed", out var p) ? p : 0;
            var failed = outcomes.TryGetValue("Failed", out var f) ? f : 0;
            var blocked = outcomes.TryGetValue("Blocked", out var b) ? b : 0;

            return new TestPlanProgressDto
            {
                SheetId = sheetId,
                PlanId = planId,
                SuiteId = suiteId,
                SuiteName = suiteName,
                Total = points.Count,
                Started = Math.Max(0, points.Count - notRun),
                Passed = passed,
                Failed = failed,
                Blocked = blocked,
                NotRun = notRun,
                Outcomes = outcomes,
                Points = points.Select((point, index) => new TestPlanPointProgressDto
                {
                    Name = BuildPointName(point, index),
                    Outcome = NormalizeOutcome(point.OutcomeValue),
                    SuiteName = point.SuiteNameValue
                }).ToList()
            };
        }

        private static string BuildPointName(TestPointDto point, int index)
        {
            var name = point.TestCaseReference?.Name
                ?? point.TestCase?.Name
                ?? point.TestCaseReference?.Id?.ToString()
                ?? point.TestCase?.Id?.ToString()
                ?? $"Testfall {index + 1}";

            var suiteName = point.SuiteNameValue;
            return string.IsNullOrWhiteSpace(suiteName)
                ? name
                : $"{suiteName} - {name}";
        }

        private static string NormalizeOutcome(string? outcome)
        {
            if (string.IsNullOrWhiteSpace(outcome))
                return "Not run";

            return outcome.Trim() switch
            {
                var value when string.Equals(value, "Unspecified", StringComparison.OrdinalIgnoreCase) => "Not run",
                var value when string.Equals(value, "None", StringComparison.OrdinalIgnoreCase) => "Not run",
                var value when string.Equals(value, "NotApplicable", StringComparison.OrdinalIgnoreCase) => "Not applicable",
                var value when string.Equals(value, "Not applicable", StringComparison.OrdinalIgnoreCase) => "Not applicable",
                var value when string.Equals(value, "Passed", StringComparison.OrdinalIgnoreCase) => "Passed",
                var value when string.Equals(value, "Failed", StringComparison.OrdinalIgnoreCase) => "Failed",
                var value when string.Equals(value, "Blocked", StringComparison.OrdinalIgnoreCase) => "Blocked",
                var value when string.Equals(value, "Active", StringComparison.OrdinalIgnoreCase) => "Active",
                var value => value
            };
        }

        private sealed class TestPointsPageDto
        {
            [JsonPropertyName("value")]
            public List<TestPointDto> Value { get; set; } = new();
        }

        private sealed class TestSuitesPageDto
        {
            [JsonPropertyName("value")]
            public List<TestSuiteDto> Value { get; set; } = new();
        }

        private sealed class TestSuiteDto
        {
            [JsonPropertyName("id")]
            public int Id { get; set; }

            [JsonPropertyName("name")]
            public string? Name { get; set; }

            [JsonPropertyName("hasChildren")]
            public bool HasChildren { get; set; }

            [JsonPropertyName("children")]
            public List<TestSuiteDto>? Children { get; set; }
        }

        private sealed class TestPointDto
        {
            [JsonPropertyName("outcome")]
            public string? Outcome { get; set; }

            [JsonPropertyName("results")]
            public TestPointResultsDto? Results { get; set; }

            [JsonPropertyName("testCase")]
            public TestCaseReferenceDto? TestCase { get; set; }

            [JsonPropertyName("testCaseReference")]
            public TestCaseReferenceDto? TestCaseReference { get; set; }

            [JsonPropertyName("suite")]
            public ShallowReferenceDto? Suite { get; set; }

            [JsonPropertyName("testSuite")]
            public ShallowReferenceDto? TestSuite { get; set; }

            public string OutcomeValue => Outcome ?? Results?.Outcome ?? string.Empty;

            public string SuiteNameOverride { get; set; } = string.Empty;

            public string SuiteNameValue => TestSuite?.Name ?? Suite?.Name ?? SuiteNameOverride;
        }

        private sealed class TestPointResultsDto
        {
            [JsonPropertyName("outcome")]
            public string? Outcome { get; set; }
        }

        private sealed class ShallowReferenceDto
        {
            [JsonPropertyName("id")]
            public int Id { get; set; }

            [JsonPropertyName("name")]
            public string? Name { get; set; }
        }

        private sealed class TestCaseReferenceDto
        {
            [JsonPropertyName("id")]
            public int? Id { get; set; }

            [JsonPropertyName("name")]
            public string? Name { get; set; }
        }
    }
}
