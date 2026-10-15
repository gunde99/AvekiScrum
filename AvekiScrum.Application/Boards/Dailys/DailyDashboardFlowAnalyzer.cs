using System;
using System.Collections.Generic;
using System.Linq;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Application.Models.Sprintbacklog;

namespace AvekiScrum.Application.Boards.Dailys
{
    internal sealed record DailyDashboardFlowResult(
        string Stage,
        string StageLabel,
        AlertLevel AlertLevel,
        string AlertSummary,
        List<string> AlertDetails);

    internal static class DailyDashboardFlowAnalyzer
    {
        public static DailyDashboardFlowResult Evaluate(
            StoryVm story,
            WorkItemDto? source,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> pullRequestDetails)
        {
            var warnings = new List<string>();
            var tasks = story.Tasks?.Where(task => !task.IsPlaceholder).ToList() ?? new List<TaskVm>();
            var devTasks = tasks.Where(IsDevelopmentTask).ToList();
            var testTasks = tasks.Where(IsTestTask).ToList();
            var documentationTasks = tasks.Where(IsDocumentationTask).ToList();

            AddDeviationWarnings(source, devTasks, testTasks, documentationTasks, story.PullRequests.ToList(), pullRequestDetails, warnings);

            var (stage, label) = DetermineStage(source, devTasks, testTasks, documentationTasks, story.PullRequests.ToList(), pullRequestDetails);
            var alertLevel = warnings.Count > 0 ? AlertLevel.Warning : AlertLevel.None;

            return new DailyDashboardFlowResult(
                stage,
                label,
                alertLevel,
                alertLevel == AlertLevel.None ? "" : ShortSummary(warnings.First()),
                warnings);
        }

        /// <summary>
        /// The board's alert badge shows this as the compact one-line headline, while the full
        /// sentence still appears as the detail line underneath - without this, the headline and
        /// the detail were identical, which read as the same claim repeated twice.
        /// </summary>
        internal static string ShortSummary(string detail)
        {
            if (detail.StartsWith("Release-branch: Saknas PR", StringComparison.OrdinalIgnoreCase)) return "Saknas PR";
            if (detail.StartsWith("Release-branch: Kort taggade med", StringComparison.OrdinalIgnoreCase)) return "Fel branch";
            if (detail.StartsWith("Release-branch: PR mot", StringComparison.OrdinalIgnoreCase)) return "Saknar release-tagg";
            if (detail.StartsWith("PR skapad och fördelad", StringComparison.OrdinalIgnoreCase)) return "Utveckling ej klar";
            if (detail.StartsWith("Test väntar", StringComparison.OrdinalIgnoreCase)) return "Test väntar";
            if (detail.StartsWith("Testkort", StringComparison.OrdinalIgnoreCase) && detail.Contains("blockerat")) return "Testkort blockerat";
            if (detail.StartsWith("PR saknar reviewer", StringComparison.OrdinalIgnoreCase)) return "PR saknar reviewer";
            if (detail.StartsWith("Kort stängt men task", StringComparison.OrdinalIgnoreCase)) return "Task öppen";
            if (detail.StartsWith("Kort stängt men PR", StringComparison.OrdinalIgnoreCase)) return "PR ej klar";
            if (detail.StartsWith("Kortets status är Closed", StringComparison.OrdinalIgnoreCase)) return "Stängt utan åtgärd";
            if (detail.StartsWith("Alla tasks är klara", StringComparison.OrdinalIgnoreCase)) return "Redo att stänga";
            return detail;
        }

        private static (string Stage, string Label) DetermineStage(
            WorkItemDto? source,
            List<TaskVm> devTasks,
            List<TaskVm> testTasks,
            List<TaskVm> documentationTasks,
            List<PullRequestCardVm> pullRequests,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> pullRequestDetails)
        {
            var sourceClosed = source?.StateEnum is WorkItemState.Closed or WorkItemState.Done;

            if (devTasks.Count == 0 || devTasks.All(IsNotStarted))
            {
                // A closed card with no (or no started) development task isn't "not started" -
                // it's done, just without going through the usual task lifecycle (e.g. closed as
                // "no action needed"). Reporting it as "Ej påbörjad" alongside a Closed status
                // badge was a contradiction; the anomaly itself is still flagged as a warning.
                if (sourceClosed)
                    return ("Done", "Utan åtgärd");

                return ("New", "Ej påbörjad");
            }

            if (!devTasks.All(IsDevelopmentComplete))
                return ("Development", "Utveckling");

            if (pullRequests.Count > 0)
            {
                if (pullRequests.Any(pr => IsPullRequestNew(pr, pullRequestDetails)))
                    return ("CodeReview", "PR skapad");

                if (pullRequests.Any(pr => IsPullRequestActive(pr, pullRequestDetails)))
                    return ("CodeReview", "Kodgranskning pågår");

                if (pullRequests.Any(pr => IsPullRequestCompleted(pr, pullRequestDetails)))
                {
                    if (testTasks.Count > 0)
                        return DetermineTestingStage(testTasks, documentationTasks);

                    return ("CodeReview", "Kodgranskad");
                }
            }

            return ("Development", "Färdigutvecklad");
        }

        private static (string Stage, string Label) DetermineTestingStage(
            List<TaskVm> testTasks,
            List<TaskVm> documentationTasks)
        {
            var test = PickCurrentTask(testTasks);

            if (test.IsBlocked)
                return ("Testing", "Blockerat test");

            if (test.Status == FlowStatus.New)
                return ("Testing", "Redo för test");

            if (test.Status == FlowStatus.Active)
            {
                if (HasTag(test, "Test ej OK"))
                    return ("Testing", "Testad: Ej OK");

                if (HasTag(test, "Test OK"))
                    return ("Testing", "Test godkänt");

                return ("Testing", "Testning pågår");
            }

            if (test.Status == FlowStatus.Closed)
            {
                if (documentationTasks.Count > 0)
                    return DetermineDocumentationStage(documentationTasks);

                return ("Done", "Testad och Klar");
            }

            return ("Testing", "Testning pågår");
        }

        private static (string Stage, string Label) DetermineDocumentationStage(List<TaskVm> documentationTasks)
        {
            if (documentationTasks.All(task => task.Status == FlowStatus.Closed || task.Stage == TaskStage.Done))
                return ("Done", "Helt Klar");

            var task = PickCurrentTask(documentationTasks);
            var noun = IsHelpTextTask(task) ? "Hjälptext" : "Dokumentation";

            if (task.Status is FlowStatus.New or FlowStatus.Active)
            {
                if (HasTag(task, "hjälptext"))
                    return ("Documentation", "Hjälptext skapad");

                return ("Documentation", noun);
            }

            return ("Documentation", noun);
        }

        private static void AddDeviationWarnings(
            WorkItemDto? source,
            List<TaskVm> devTasks,
            List<TaskVm> testTasks,
            List<TaskVm> documentationTasks,
            List<PullRequestCardVm> pullRequests,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> pullRequestDetails,
            List<string> warnings)
        {
            var sourceClosed = source?.StateEnum is WorkItemState.Closed or WorkItemState.Done;

            var sourceClosedNoAction = sourceClosed
                && (devTasks.Count == 0 || devTasks.All(IsNotStarted));
            if (sourceClosedNoAction)
                warnings.Add("Kortets status är Closed men det finns ingen development-task.");

            var activePullRequests = pullRequests
                .Where(pr => IsPullRequestActive(pr, pullRequestDetails))
                .ToList();

            // Ingen varning för PR under granskning medan utveckling pågår. Att lägga upp en del för
            // granskning och fortsätta med nästa är hur teamet arbetar, inte ett fel. Av samma skäl
            // finns ingen varning för att testa innan utveckling/PR är helt klar - delvis testning
            // medan resten av kortet pågår är hur teamet jobbar, inte en avvikelse.

            var sourceResolved = source?.StateEnum is WorkItemState.Resolved or WorkItemState.Closed or WorkItemState.Done;
            if (!sourceResolved && testTasks.Any(IsTestInProgress))
                warnings.Add("Test väntar på att huvudkortet blir Resolved");

            foreach (var test in testTasks.Where(task => task.IsBlocked))
                warnings.Add($"Testkort {test.Key} blockerat");

            if (AllCardsClosed(source, devTasks, testTasks, documentationTasks))
            {
                var activeWithoutRequiredReviewers = activePullRequests
                    .Where(pr => HasPullRequestDetails(pr, pullRequestDetails) && !HasRequiredReviewer(pr, pullRequestDetails))
                    .Select(pr => pr.PullRequestId)
                    .Distinct()
                    .ToList();

                if (activeWithoutRequiredReviewers.Count > 0)
                    warnings.Add("PR saknar reviewer trots att allt är stängt");
            }

            // De flesta avvikelser nedan är bara värda att agera på om huvudkortet redan är Closed -
            // är det inte det, är det bara ett kort som fortfarande jobbas på, inte ett glömt kort.
            if (sourceClosed)
            {
                var openTasks = devTasks
                    .Concat(testTasks)
                    .Concat(documentationTasks)
                    .Where(task => task.Status != FlowStatus.Closed && task.Stage != TaskStage.Done)
                    .Select(task => string.IsNullOrWhiteSpace(task.Key) ? task.Id.ToString() : task.Key)
                    .Distinct()
                    .ToList();

                if (openTasks.Count > 0)
                    warnings.Add($"Kort stängt men task öppen: {string.Join(", ", openTasks)}");

                // En övergiven PR är i sig inget problem - man byter approach, öppnar en ny mot samma
                // gren. Den ignoreras helt här, i stället för att räknas som att PR-steget är
                // oavslutat.
                var incompletePullRequests = pullRequests
                    .Where(pr => !IsPullRequestCompleted(pr, pullRequestDetails) && !IsPullRequestAbandoned(pr, pullRequestDetails))
                    .Select(pr => pr.PullRequestId)
                    .Distinct()
                    .ToList();

                if (incompletePullRequests.Count > 0)
                    warnings.Add("Kort stängt men PR ej klar");
            }
            else if (source != null)
            {
                // Spegelvändningen av ovanstående: huvudkortet själv är det som släpar efter, inte
                // en task eller en PR. En övergiven PR räknas som "klar" här av samma skäl som den
                // ignoreras helt ovan - den ska inte kunna hindra att kortet stängs.
                var allTasks = devTasks.Concat(testTasks).Concat(documentationTasks).ToList();
                var allTasksClosed = allTasks.Count > 0 && allTasks.All(IsClosedTask);
                var noOutstandingPullRequests = pullRequests.All(pr =>
                    IsPullRequestCompleted(pr, pullRequestDetails) || IsPullRequestAbandoned(pr, pullRequestDetails));

                if (allTasksClosed && noOutstandingPullRequests)
                    warnings.Add("Alla tasks är klara och inga PR kvar - huvudkortet kan stängas.");
            }
        }

        private static TaskVm PickCurrentTask(List<TaskVm> tasks)
            => tasks
                .OrderBy(task => task.Status == FlowStatus.Closed ? 1 : 0)
                .ThenByDescending(task => task.StatusChangedDate ?? task.CreatedDate)
                .First();

        private static bool IsDevelopmentTask(TaskVm task)
            => task.Stage is TaskStage.New or TaskStage.Active or TaskStage.Resolved or TaskStage.Done;

        private static bool IsTestTask(TaskVm task)
            => task.Stage == TaskStage.Test || TextEquals(task.Activity, "Testing") || TextEquals(task.Activity, "Test");

        private static bool IsDocumentationTask(TaskVm task)
            => task.Stage == TaskStage.Documentation || TextEquals(task.Activity, "Documentation");

        private static bool IsNotStarted(TaskVm task)
            => task.Stage == TaskStage.New && task.Status == FlowStatus.New;

        private static bool IsDevelopmentComplete(TaskVm task)
            => task.Stage is TaskStage.Resolved or TaskStage.Done || task.Status == FlowStatus.Closed;

        private static bool AllCardsClosed(
            WorkItemDto? source,
            List<TaskVm> devTasks,
            List<TaskVm> testTasks,
            List<TaskVm> documentationTasks)
        {
            var sourceClosed = source == null || source.StateEnum is WorkItemState.Closed or WorkItemState.Done;
            var tasks = devTasks
                .Concat(testTasks)
                .Concat(documentationTasks)
                .ToList();

            return sourceClosed && tasks.All(IsClosedTask);
        }

        private static bool IsClosedTask(TaskVm task)
            => task.Status == FlowStatus.Closed || task.Stage == TaskStage.Done;

        private static bool IsTestStarted(TaskVm task)
            => task.Status != FlowStatus.New || HasTag(task, "Test OK") || HasTag(task, "Test ej OK");

        /// <summary>
        /// Started but not finished. The deviation warnings below are all present-tense claims
        /// ("test is running too early", "test is waiting") - a Closed test task isn't running or
        /// waiting any more, so counting it as "started" produced warnings that contradicted the
        /// card's own taskboard. A story can have several test tasks; only the unfinished ones
        /// should be able to trigger these.
        /// </summary>
        private static bool IsTestInProgress(TaskVm task)
            => IsTestStarted(task) && task.Status != FlowStatus.Closed && task.Stage != TaskStage.Done;

        private static bool IsHelpTextTask(TaskVm task)
            => task.Title?.IndexOf("hjälptext", StringComparison.OrdinalIgnoreCase) >= 0;

        private static bool HasTag(TaskVm task, string tag)
            => task.Tags.Any(value => string.Equals(value, tag, StringComparison.OrdinalIgnoreCase));

        private static bool TextEquals(string? actual, string expected)
            => string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);

        private static bool IsPullRequestNew(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
        {
            var status = GetPullRequestStatus(pullRequest, details);
            return string.IsNullOrWhiteSpace(status) ||
                   status is "new" or "unknown" or "notset" or "not set";
        }

        private static bool IsPullRequestActive(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
            => GetPullRequestStatus(pullRequest, details) == "active";

        private static bool IsPullRequestCompleted(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
            => GetPullRequestStatus(pullRequest, details) is "completed" or "complete" or "merged";

        private static bool IsPullRequestAbandoned(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
            => GetPullRequestStatus(pullRequest, details) is "abandoned" or "aborted";

        private static bool HasRequiredReviewer(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
        {
            details.TryGetValue((pullRequest.RepoId, pullRequest.PullRequestId), out var detail);
            return detail?.RequiredReviewers?.Any(value => !string.IsNullOrWhiteSpace(value)) == true;
        }

        private static bool HasPullRequestDetails(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
            => details.ContainsKey((pullRequest.RepoId, pullRequest.PullRequestId));

        private static string GetPullRequestStatus(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> details)
        {
            details.TryGetValue((pullRequest.RepoId, pullRequest.PullRequestId), out var detail);
            var status = string.IsNullOrWhiteSpace(detail?.Status)
                ? pullRequest.Status
                : detail.Status;

            return (status ?? string.Empty).Trim().ToLowerInvariant();
        }
    }
}
