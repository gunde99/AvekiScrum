using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Application.Helpers
{
    // --------------- KPI-beräkning ---------------
    public static class MetricsCalculator
    {
        public static PrMetrics ComputePrMetrics(PullRequestDto pr, IReadOnlyList<PrThread> threads)
        {
            var authorId = pr.CreatedBy.Id;
            var allComments = threads.SelectMany(t => t.Comments ?? new()).ToList();

            // first review comment by someone other than author
            var firstReviewTime = allComments
                .Where(c => c.Author.Id != authorId && c.PublishedDate is not null)
                .OrderBy(c => c.PublishedDate)
                .Select(c => c.PublishedDate!.Value)
                .Cast<DateTimeOffset?>()
                .FirstOrDefault();

            var unresolved = threads.Count(t => string.Equals(t.Status, "active", StringComparison.OrdinalIgnoreCase));

            var approveVotes = pr.Reviewers?.Count(r => r.Vote > 0) ?? 0;
            var rejectVotes = pr.Reviewers?.Count(r => r.Vote < 0) ?? 0;

            return new PrMetrics
            {
                PrId = pr.PullRequestId,
                Repository = pr.RepositoryName,
                Title = pr.Title ?? "",
                Author = pr.CreatedBy.DisplayName ?? "",
                Created = pr.CreatedUtc.ToOffset(),
                Closed = pr.ClosedUtc.ToOffset(),
                CycleTime = (pr.ClosedUtc ?? pr.CreatedUtc) - pr.CreatedUtc ?? TimeSpan.MinValue,
                TimeToFirstReview = firstReviewTime is null ? null : firstReviewTime - pr.CreatedUtc,
                TotalComments = allComments.Count,
                UnresolvedThreads = unresolved,
                ReviewerCount = pr.Reviewers?.Count ?? 0,
                ApproveVotes = approveVotes,
                RejectVotes = rejectVotes
            };
        }

        public static TestingTaskMetrics ComputeTestingTaskMetrics(WorkItemDto wi, List<WorkItemUpdate> updates)
        {
            DateTimeOffset created = wi.CreatedTimestampUtc();

            string? title = wi.Title;

            // pickup latency = when AssignedTo first becomes non-null
            DateTimeOffset? firstAssignedAt = updates
                .Where(u => u.Fields?.AssignedTo?.NewValue is not null)
                .OrderBy(u => u.RevisedDate)
                .Select(u => (DateTimeOffset?)u.RevisedDate)
                .FirstOrDefault();

            // CompletedAt = first time state enters one of Done/Closed/Resolved
            var doneStates = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Done", "Closed", "Resolved" };
            DateTimeOffset? completedAt = updates
                .Where(u => doneStates.Contains(u.Fields?.State?.NewValue ?? ""))
                .OrderBy(u => u.RevisedDate)
                .Select(u => (DateTimeOffset?)u.RevisedDate)
                .FirstOrDefault();

            // ActiveTestingDuration = summa intervall där State = "Active" eller "In Progress"
            var activeStates = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Active", "In Progress" };
            var timeline = new List<(DateTimeOffset At, string State)>();

            // Starta med initialt state från work item fields
            var initialState = wi.State ?? "New";
            timeline.Add((created, initialState));

            foreach (var u in updates.Where(u => u.Fields?.State is not null).OrderBy(u => u.RevisedDate))
                timeline.Add((u.RevisedDate, u.Fields!.State!.NewValue!));

            // Stäng tidslinjen vid CompletedAt eller nu
            var end = completedAt ?? (updates.LastOrDefault()?.RevisedDate ?? DateTimeOffset.UtcNow);
            TimeSpan activeSum = TimeSpan.Zero;
            for (int i = 0; i < timeline.Count; i++)
            {
                var cur = timeline[i];
                var nextAt = (i + 1 < timeline.Count) ? timeline[i + 1].At : end;
                if (activeStates.Contains(cur.State))
                    activeSum += nextAt - cur.At;
            }

            // Hade taggen "EJ OK" någon gång?
            bool hadEjOk = false;
            // 1) kolla nuvarande tags
            var currentTags = wi.Tags;
            if (currentTags.Contains("EJ OK"))
                //if (currentTags.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                //               .Any(t => string.Equals(t, "EJ OK", StringComparison.OrdinalIgnoreCase)))
                hadEjOk = true;

            // 2) eller historiskt via updates
            if (!hadEjOk)
            {
                foreach (var u in updates.Where(u => u.Fields?.Tags is not null))
                {
                    var newTags = u.Fields!.Tags!.NewValue ?? "";
                    if (newTags.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                               .Any(t => string.Equals(t, "EJ OK", StringComparison.OrdinalIgnoreCase)))
                    {
                        hadEjOk = true; break;
                    }
                }
            }

            return new TestingTaskMetrics
            {
                Id = wi.Id,
                Title = title ?? $"Task {wi.Id}",
                Created = created,
                FirstAssignedAt = firstAssignedAt,
                CompletedAt = completedAt,
                ActiveTestingDuration = activeSum,
                HadEjOkTag = hadEjOk,
                FinalState = updates.LastOrDefault()?.Fields?.State?.NewValue ?? initialState
            };
        }
    }
}
