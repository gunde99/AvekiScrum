using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Mappers;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Application.Models.Sprintbacklog;
using AvekiScrum.Domain.Entities.Scrum;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Application.Boards.Dailys
{
    public sealed class DailyDashboardDataBuilder
    {
        private readonly IAzureDevOpsService _azureDevOpsService;
        private readonly string _projectBaseUrl;

        public DailyDashboardDataBuilder(IAzureDevOpsService azureDevOpsService, IOptions<AzureSettings> azureSettings)
        {
            _azureDevOpsService = azureDevOpsService ?? throw new ArgumentNullException(nameof(azureDevOpsService));
            var settings = azureSettings?.Value ?? throw new ArgumentNullException(nameof(azureSettings));
            // Built from the effective (possibly Testing:ProjectOverride'd) org/project rather than a
            // hardcoded org/project, so "open in Azure" links always point at the same project the
            // board's data actually came from.
            _projectBaseUrl = $"https://dev.azure.com/{settings.Organization}/{settings.Project}/";
        }

        public async Task<string> BuildJsonAsync(
            Sprint selectedSprint,
            IReadOnlyDictionary<DeveloperTeam, IReadOnlyList<WorkItemDto>> backlogByTeam,
            IReadOnlySet<int>? productOwnerOwnedStoryIds = null)
        {
            var teams = new List<object>();
            foreach (var team in backlogByTeam.OrderBy(team => team.Key == DeveloperTeam.Nord ? 0 : 1))
            {
                var metadata = team.Key.GetMetadata();
                teams.Add(new
                {
                    id = TeamId(team.Key),
                    name = metadata?.AzureDevOpsName ?? $"Team {team.Key}",
                    sprintBoardUrl = SprintBoardUrl(team.Key, selectedSprint),
                    stories = await BuildStoriesAsync(team.Value, selectedSprint, productOwnerOwnedStoryIds)
                });
            }

            var data = new
            {
                meta = new
                {
                    sprint = selectedSprint.Name,
                    sprintStart = selectedSprint.StartDate.ToString("yyyy-MM-dd"),
                    sprintEnd = selectedSprint.EndDate.ToString("yyyy-MM-dd"),
                    generatedAt = DateTime.Now.ToString("o")
                },
                teams
            };

            return JsonSerializer.Serialize(data, new JsonSerializerOptions
            {
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            });
        }

        private async Task<List<object>> BuildStoriesAsync(
            IReadOnlyList<WorkItemDto> sprintBacklog,
            Sprint selectedSprint,
            IReadOnlySet<int>? productOwnerOwnedStoryIds = null)
        {
            var stories = SprintBacklogMapper.MapToStories(
                    sprintBacklog,
                    SprintBacklogMapper.MapOptions.Default(item => item.ParentId))
                // Hjälptext satellite stories (created via the DoR "Hjälptext" category) are
                // Related to their development story, not a child of it, and exist purely to hold
                // a Documentation task - they shouldn't show up as their own row/group on the
                // board, as if they were independent work belonging to a documentation writer.
                .Where(story => !IsHelptextSatelliteTitle(story.Title))
                .ToList();

            var workItemsById = sprintBacklog
                .GroupBy(item => item.Id)
                .ToDictionary(group => group.Key, group => group.First());

            var pullRequestDetails = await LoadPullRequestDetailsAsync(stories.SelectMany(story => story.PullRequests));
            var testTaskTimelines = await LoadTestTaskTimelinesAsync(stories.SelectMany(story => story.Tasks));

            var result = new List<object>();
            foreach (var story in stories)
            {
                workItemsById.TryGetValue(story.Id, out var source);
                var flow = DailyDashboardFlowAnalyzer.Evaluate(story, source, pullRequestDetails);
                var releaseBranchValidation = ReleaseBranchValidator.Evaluate(story, source, pullRequestDetails);
                var alertDetails = flow.AlertDetails
                    .Concat(releaseBranchValidation.Warnings)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                var alertLevel = flow.AlertLevel == AlertLevel.None && alertDetails.Count > 0
                    ? AlertLevel.Warning
                    : flow.AlertLevel;
                var alertSummary = alertDetails.Count == 0
                    ? flow.AlertSummary
                    : flow.AlertLevel == AlertLevel.None
                        ? DailyDashboardFlowAnalyzer.ShortSummary(alertDetails.First())
                        : flow.AlertSummary;
                var lastChangedDate = LatestChangedDate(story, source, pullRequestDetails);

                result.Add(new
                {
                    id = story.Id,
                    key = story.Key,
                    type = source?.TypeEnum == WorkItemType.Bug ? "Bug" : "User Story",
                    title = story.Title,
                    azureStatus = FirstNonEmpty(source?.State, source?.StateEnum.ToString(), story.Stage.ToString()),
                    lastChangedDate = FormatDateTime(lastChangedDate),
                    createdDate = FormatDate(source?.CreatedDate ?? story.CreatedDate),
                    addedDuringSprint = IsInSprint(source?.CreatedDate ?? story.CreatedDate, selectedSprint),
                    developer = story.Developer,
                    developmentPartner = source?.DevelopmentPartner,
                    assignedTeam = source?.AssignedTeam,
                    areaPath = source?.AreaPath,
                    // Underlaget för korthygienvarningarna på raden. Bara det boarden behöver för
                    // att ställa samma frågor som valideringsdialogen, utan att skicka med hela
                    // beskrivningen för varje kort.
                    hasParent = source?.ParentId != null,
                    hasDescription = source?.HasDescription ?? false,
                    hasAcceptanceCriteria = source?.HasAcceptanceCriteria ?? false,
                    tags = source?.Tags ?? new List<string>(),
                    stakeholders = source?.Stakeholders ?? new List<string>(),
                    sprintGoal = string.IsNullOrWhiteSpace(story.SprintGoal) ? "(Inget sprintmål)" : story.SprintGoal,
                    storyPoints = story.StoryPoints ?? 0,
                    stage = flow.Stage,
                    stageLabel = flow.StageLabel,
                    alertLevel = alertLevel.ToString(),
                    alertSummary,
                    alertDetails,
                    releaseBranchWarnings = releaseBranchValidation.Warnings,
                    webUrl = WorkItemUrl(story.Id),
                    completedDate = FormatDate(story.CompletedDate),
                    ownedByProductOwner = productOwnerOwnedStoryIds?.Contains(story.Id) ?? false,
                    tasks = story.Tasks.Select(task => ToTask(task, testTaskTimelines)).ToList(),
                    pullRequests = story.PullRequests.Select(pr => ToPullRequest(pr, pullRequestDetails)).ToList()
                });
            }

            return result;
        }

        private object ToTask(
            TaskVm task,
            IReadOnlyDictionary<int, TestTaskTimeline> testTaskTimelines)
        {
            testTaskTimelines.TryGetValue(task.Id, out var timeline);

            return new
            {
                id = task.Id,
                key = task.Key,
                storyId = task.StoryId,
                title = task.Title,
                stage = task.Stage.ToString(),
                status = task.Status.ToString(),
                assignedTo = task.AssignedTo,
                activity = task.Activity,
                isBlocked = task.IsBlocked,
                tags = task.Tags,
                createdDate = FormatDate(task.CreatedDate),
                completedDate = FormatDate(task.CompletedDate),
                statusChangedDate = FormatDateTime(task.StatusChangedDate),
                assignedDate = FormatDate(timeline?.AssignedDate),
                testEjOkExcludedDays = timeline?.TestEjOkExcludedDays,
                leadDays = timeline?.LeadDays,
                webUrl = WorkItemUrl(task.Id)
            };
        }

        private static object ToPullRequest(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> detailsByPullRequest)
        {
            detailsByPullRequest.TryGetValue((pullRequest.RepoId, pullRequest.PullRequestId), out var details);
            var webUrl = FirstNonEmpty(details?.WebUrl, pullRequest.WebUrl, PullRequestUrl(pullRequest.RepoId, pullRequest.PullRequestId));
            var status = NormalizePullRequestStatus(FirstNonEmpty(details?.Status, pullRequest.Status));

            return new
            {
                pullRequestId = pullRequest.PullRequestId,
                storyId = pullRequest.StoryId,
                sourceTaskId = pullRequest.SourceTaskId,
                title = pullRequest.Title,
                status,
                targetBranch = details?.TargetBranch ?? string.Empty,
                reviewers = details?.Reviewers ?? Array.Empty<string>(),
                webUrl,
                createdDate = FormatDate(pullRequest.CreatedDate),
                closedDate = FormatDate(details?.ClosedDate),
                createdBy = FirstNonEmpty(details?.CreatedBy, pullRequest.CreatedBy),
                createdByUniqueName = FirstNonEmpty(details?.CreatedByUniqueName, pullRequest.CreatedByUniqueName)
            };
        }

        private static DateTime? LatestChangedDate(
            StoryVm story,
            WorkItemDto? source,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> detailsByPullRequest)
        {
            var dates = new List<DateTime?>();

            if (source != null)
            {
                dates.Add(source.ChangedDate);
                dates.Add(source.ResolvedDate);
                dates.Add(source.ClosedDate);
                dates.Add(source.CreatedDate);
            }

            dates.Add(story.CompletedDate);
            dates.Add(story.CreatedDate);

            foreach (var task in story.Tasks)
            {
                dates.Add(task.StatusChangedDate);
                dates.Add(task.CompletedDate);
                dates.Add(task.CreatedDate);
            }

            foreach (var pullRequest in story.PullRequests)
            {
                dates.Add(pullRequest.CreatedDate);
                if (detailsByPullRequest.TryGetValue((pullRequest.RepoId, pullRequest.PullRequestId), out var details))
                {
                    dates.Add(details.CreationDate);
                    dates.Add(details.ClosedDate);
                }
            }

            return dates
                .Where(date => date.HasValue && date.Value.Year > 1900)
                .Select(date => date!.Value)
                .DefaultIfEmpty()
                .Max();
        }

        private async Task<IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails>> LoadPullRequestDetailsAsync(
            IEnumerable<PullRequestCardVm> pullRequests)
        {
            var result = new Dictionary<(Guid RepoId, int PullRequestId), PullRequestDetails>();
            var distinct = pullRequests
                .Where(pr => pr.RepoId != Guid.Empty && pr.PullRequestId > 0)
                .GroupBy(pr => (pr.RepoId, pr.PullRequestId))
                .Select(group => group.Key)
                .ToList();

            foreach (var key in distinct)
            {
                try
                {
                    result[key] = await _azureDevOpsService.GetPullRequestDetailsAsync(
                        key.RepoId.ToString(),
                        key.PullRequestId);
                }
                catch
                {
                    // Work item relations are still useful even if a PR was deleted or the repo is inaccessible.
                }
            }

            return result;
        }

        private async Task<IReadOnlyDictionary<int, TestTaskTimeline>> LoadTestTaskTimelinesAsync(
            IEnumerable<TaskVm> tasks)
        {
            var result = new Dictionary<int, TestTaskTimeline>();
            var distinct = tasks
                .Where(IsTestTask)
                .GroupBy(task => task.Id)
                .Select(group => group.First())
                .ToList();

            foreach (var task in distinct)
            {
                try
                {
                    var updates = await _azureDevOpsService.GetWorkItemUpdatesAsync(task.Id);
                    result[task.Id] = BuildTestTaskTimeline(task, updates.Value);
                }
                catch
                {
                    // Testkortet kan fortfarande visas, men utan historikbaserad ledtid.
                }
            }

            return result;
        }

        private static string TeamId(DeveloperTeam team)
            => team == DeveloperTeam.Syd ? "team-syd" : "team-nord";

        private string SprintBoardUrl(DeveloperTeam team, Sprint sprint)
        {
            var teamUrl = team.GetMetadata()?.TeamUrl ?? Uri.EscapeDataString($"Team {team}");
            var iterationPath = Uri.EscapeDataString(sprint.Path ?? string.Empty);
            return $"{_projectBaseUrl}{teamUrl}/_sprints/taskboard/{teamUrl}/{iterationPath}";
        }

        private string WorkItemUrl(int id) => $"{_projectBaseUrl}_workitems/edit/{id}";

        private static string PullRequestUrl(Guid repoId, int pullRequestId)
            => repoId == Guid.Empty || pullRequestId <= 0
                ? string.Empty
                : $"https://dev.azure.com/Aveki/Utveckling/_git/{Uri.EscapeDataString(repoId.ToString())}/pullrequest/{pullRequestId}";

        private static string? FormatDate(DateTime? date)
            => date.HasValue ? date.Value.ToString("yyyy-MM-dd") : null;

        private static string? FormatDateTime(DateTime? date)
            => date.HasValue && date.Value != default ? date.Value.ToString("o") : null;

        private static string FirstNonEmpty(params string?[] values)
            => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

        private static bool IsInSprint(DateTime date, Sprint sprint)
            => date.Date >= sprint.StartDate.Date && date.Date <= sprint.EndDate.Date;

        private static bool IsHelptextSatelliteTitle(string? title)
            => !string.IsNullOrWhiteSpace(title) && title.TrimStart().StartsWith("Hjälptext", StringComparison.OrdinalIgnoreCase);

        private static bool IsTestTask(TaskVm task)
            => task.Stage == TaskStage.Test ||
               string.Equals(task.Activity, "Testing", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(task.Activity, "Test", StringComparison.OrdinalIgnoreCase);

        private static TestTaskTimeline BuildTestTaskTimeline(
            TaskVm task,
            IReadOnlyList<WorkItemUpdate> updates)
        {
            var orderedUpdates = updates
                .OrderBy(update => update.RevisedDate)
                .ToList();

            var assignedDate = orderedUpdates
                .Where(update => !IsEmptyIdentity(update.Fields?.AssignedTo?.NewValue))
                .Select(update => (DateTime?)update.RevisedDate.LocalDateTime)
                .FirstOrDefault();

            if (!assignedDate.HasValue && !string.IsNullOrWhiteSpace(task.AssignedTo))
            {
                assignedDate = task.CreatedDate;
            }

            var doneStates = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Done",
                "Closed",
                "Resolved"
            };

            var completedDate = task.CompletedDate ??
                orderedUpdates
                    .Where(update => doneStates.Contains(update.Fields?.State?.NewValue ?? string.Empty))
                    .Select(update => (DateTime?)update.RevisedDate.LocalDateTime)
                    .FirstOrDefault();

            if (!assignedDate.HasValue || !completedDate.HasValue)
            {
                return new TestTaskTimeline(assignedDate, null, null);
            }

            var excludedDays = SumTagIntervalDays(
                task,
                orderedUpdates,
                "Test ej OK",
                assignedDate.Value,
                completedDate.Value);

            var totalDays = Math.Max(0, (completedDate.Value - assignedDate.Value).TotalDays);
            var leadDays = Math.Max(0, totalDays - excludedDays);

            return new TestTaskTimeline(
                assignedDate,
                RoundDays(excludedDays),
                RoundDays(leadDays));
        }

        private static bool IsEmptyIdentity(IdentityRef? identity)
            => identity == null ||
               (string.IsNullOrWhiteSpace(identity.DisplayName) &&
                string.IsNullOrWhiteSpace(identity.UniqueName) &&
                string.IsNullOrWhiteSpace(identity.Id));

        private static double SumTagIntervalDays(
            TaskVm task,
            IReadOnlyList<WorkItemUpdate> updates,
            string tag,
            DateTime start,
            DateTime end)
        {
            if (end <= start)
                return 0;

            var tagUpdates = updates
                .Where(update => update.Fields?.Tags != null)
                .OrderBy(update => update.RevisedDate)
                .ToList();

            if (tagUpdates.Count == 0)
            {
                return task.Tags.Any(value => string.Equals(value, tag, StringComparison.OrdinalIgnoreCase))
                    ? RoundDays((end - start).TotalDays)
                    : 0;
            }

            var cursor = task.CreatedDate == default ? start : task.CreatedDate;
            var isTagged = TagsContain(tagUpdates[0].Fields?.Tags?.OldValue, tag);
            var total = 0d;

            foreach (var update in tagUpdates)
            {
                var at = update.RevisedDate.LocalDateTime;
                if (isTagged)
                {
                    total += OverlapDays(cursor, at, start, end);
                }

                isTagged = TagsContain(update.Fields?.Tags?.NewValue, tag);
                cursor = at;
            }

            if (isTagged)
            {
                total += OverlapDays(cursor, end, start, end);
            }

            return RoundDays(total);
        }

        private static bool TagsContain(string? tags, string tag)
            => (tags ?? string.Empty)
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Any(value => string.Equals(value, tag, StringComparison.OrdinalIgnoreCase));

        private static double OverlapDays(DateTime from, DateTime to, DateTime windowStart, DateTime windowEnd)
        {
            var start = from > windowStart ? from : windowStart;
            var end = to < windowEnd ? to : windowEnd;
            return end <= start ? 0 : (end - start).TotalDays;
        }

        private static double RoundDays(double value)
            => Math.Round(value, 1, MidpointRounding.AwayFromZero);

        private static string NormalizePullRequestStatus(string status)
        {
            return status.Trim().ToLowerInvariant() switch
            {
                "completed" or "complete" or "merged" => "Completed",
                "abandoned" or "aborted" => "Abandoned",
                "active" => "Active",
                _ => string.IsNullOrWhiteSpace(status) ? "Unknown" : status
            };
        }

        private sealed record TestTaskTimeline(
            DateTime? AssignedDate,
            double? TestEjOkExcludedDays,
            double? LeadDays);
    }
}
