using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum.TestPlans;

namespace AvekiScrum.Application.Abstractions.Services;

/// <summary>Project-scoped test management. Uses the caller's configured Azure credential.</summary>
public interface ITestPlansService
{
    Task<IReadOnlyList<TestPlanDto>> GetPlansAsync(CancellationToken ct = default);
    Task<TestPlanDto> CreatePlanAsync(TestPlanWrite request, CancellationToken ct = default);
    Task<TestPlanDto> UpdatePlanAsync(int planId, TestPlanWrite request, CancellationToken ct = default);
    Task<IReadOnlyList<TestSuiteDto>> GetSuitesAsync(int planId, CancellationToken ct = default);
    Task<TestSuiteDto> CreateSuiteAsync(int planId, TestSuiteWrite request, CancellationToken ct = default);
    Task<TestSuiteDto> UpdateSuiteAsync(int planId, int suiteId, TestSuiteWrite request, CancellationToken ct = default);
    Task<IReadOnlyList<SuiteTestCaseDto>> GetSuiteCasesAsync(int planId, int suiteId, CancellationToken ct = default);
    Task<TestCaseDto> GetCaseAsync(int caseId, CancellationToken ct = default);
    Task<IReadOnlyList<TestCaseDto>> GetCasesAsync(IReadOnlyList<int> caseIds, CancellationToken ct = default);
    Task<TestExecutionCaseDto> GetExecutionCaseAsync(int caseId, int? revision = null, CancellationToken ct = default);
    Task<TestCaseDto> CreateCaseAsync(TestCaseWrite request, CancellationToken ct = default);
    Task<TestCaseDto> UpdateCaseAsync(int caseId, TestCaseWrite request, CancellationToken ct = default);
    Task AddCasesAsync(int planId, int suiteId, TestCaseMembership request, CancellationToken ct = default);
    Task RemoveCasesAsync(int planId, int suiteId, IReadOnlyList<int> caseIds, CancellationToken ct = default);
    Task<IReadOnlyList<TestPointDto>> GetPointsAsync(int planId, int suiteId, CancellationToken ct = default);
    Task AssignTesterAsync(int planId, int suiteId, int pointId, string testerId, CancellationToken ct = default);
    Task<IReadOnlyList<TestConfigurationDto>> GetConfigurationsAsync(CancellationToken ct = default);
    Task<TestConfigurationDto> CreateConfigurationAsync(TestConfigurationWrite request, CancellationToken ct = default);
    Task<TestConfigurationDto> UpdateConfigurationAsync(int configurationId, TestConfigurationWrite request, CancellationToken ct = default);
    Task<TestRunDto> CreateRunAsync(TestRunWrite request, CancellationToken ct = default);
    Task<TestRunDto> GetRunAsync(int runId, CancellationToken ct = default);
    Task<IReadOnlyList<TestResultDto>> GetResultsAsync(int runId, CancellationToken ct = default);
    Task UpdateResultsAsync(int runId, IReadOnlyList<TestResultWrite> results, CancellationToken ct = default);
    Task<TestRunDto> CompleteRunAsync(int runId, CancellationToken ct = default);
}

