using System;
using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Scrum.TestPlans;

public sealed record TestPlanReferenceDto(int Id, string Name);

public sealed record TestPlanDto(
    int Id,
    string Name,
    string? Description,
    string State,
    string AreaPath,
    string Iteration,
    int Revision,
    DateTimeOffset? StartDate,
    DateTimeOffset? EndDate,
    TestPlanReferenceDto? RootSuite);

public sealed record TestPlanWrite(
    string Name,
    string AreaPath,
    string Iteration,
    string? Description = null,
    string State = "Active",
    DateTimeOffset? StartDate = null,
    DateTimeOffset? EndDate = null,
    int? Revision = null);

public sealed record TestSuiteDto(
    int Id,
    string Name,
    string SuiteType,
    int Revision,
    TestPlanReferenceDto? ParentSuite,
    IReadOnlyList<TestPlanReferenceDto> DefaultConfigurations,
    bool InheritDefaultConfigurations,
    bool HasChildren,
    IReadOnlyList<TestSuiteDto> Children);

public sealed record TestSuiteWrite(
    string Name,
    int? ParentSuiteId = null,
    string SuiteType = "staticTestSuite",
    int? RequirementId = null,
    string? QueryString = null,
    IReadOnlyList<int>? DefaultConfigurationIds = null,
    bool InheritDefaultConfigurations = true,
    int? Revision = null);

public sealed record TestStepDto(int Id, string ActionHtml, string ExpectedHtml);

public sealed record TestExecutionStepDto(
    string ActionPath,
    string StepIdentifier,
    string ActionHtml,
    string ExpectedHtml,
    string? SharedStepTitle = null);

public sealed record TestExecutionCaseDto(
    TestCaseDto TestCase,
    IReadOnlyList<TestExecutionStepDto> Steps,
    string? Warning = null);

public sealed record TestCaseDto(
    int Id,
    int Revision,
    string Title,
    string State,
    string AreaPath,
    string IterationPath,
    int Priority,
    string? AssignedTo,
    string? AutomationStatus,
    IReadOnlyList<TestStepDto> Steps,
    string? WebUrl);

public sealed record TestCaseWrite(
    string Title,
    string AreaPath,
    string IterationPath,
    IReadOnlyList<TestStepDto> Steps,
    string State = "Design",
    int Priority = 2,
    string? AssignedTo = null,
    int? Revision = null);

public sealed record SuiteTestCaseDto(
    int Id,
    string Name,
    IReadOnlyList<TestPlanReferenceDto> Configurations,
    IReadOnlyList<TestPlanReferenceDto> Testers);

public sealed record TestCaseMembership(
    IReadOnlyList<int> CaseIds,
    IReadOnlyList<int>? ConfigurationIds = null);

public sealed record TestPointDto(
    int Id,
    TestPlanReferenceDto TestCase,
    TestPlanReferenceDto Configuration,
    string Outcome,
    string State,
    string? Tester,
    int? LastRunId,
    int? LastResultId);

public sealed record TestConfigurationDto(int Id, string Name, string State, string? Description, int Revision, bool IsDefault);
public sealed record TestConfigurationWrite(string Name, string State = "Active", string? Description = null, IReadOnlyDictionary<string, string>? Values = null, int? Revision = null);

public sealed record TestRunDto(
    int Id,
    string Name,
    string State,
    bool IsAutomated,
    DateTimeOffset? StartedDate,
    DateTimeOffset? CompletedDate,
    string? WebUrl);

public sealed record TestRunWrite(string Name, int PlanId, IReadOnlyList<int> PointIds, string? Comment = null);

public sealed record TestActionResultDto(
    string ActionPath,
    string StepIdentifier,
    string Outcome,
    string? Comment);

public sealed record TestResultDto(
    int Id,
    string Outcome,
    string State,
    string? Comment,
    int? TestCaseId,
    int? TestPointId,
    int? TestCaseRevision,
    DateTimeOffset? CompletedDate,
    string? Tester,
    IReadOnlyList<TestActionResultDto> ActionResults);

public sealed record TestActionResultWrite(
    string ActionPath,
    string StepIdentifier,
    string Outcome,
    string? Comment = null);

public sealed record TestResultWrite(
    int Id,
    string Outcome,
    string State = "Completed",
    string? Comment = null,
    string? FailureType = null,
    IReadOnlyList<int>? AssociatedBugIds = null,
    IReadOnlyList<TestActionResultWrite>? ActionResults = null);


