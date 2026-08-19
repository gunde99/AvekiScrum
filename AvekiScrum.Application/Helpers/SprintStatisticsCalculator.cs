using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums; // WorkItemType, WorkItemState

namespace AvekiScrum.Application.Helpers
{
    public static class SprintStatisticsCalculator
    {
        private enum SprintStatusCategory
        {
            NotStarted,
            Active,
            Resolved,
            Closed
        }

        public static SprintEvaluationStatisticsDto BuildSprintStatistics(
            IReadOnlyCollection<WorkItemDto> workItems,
            DateTime sprintStart,
            DateTime sprintEnd,
            string sprintName = null,
            string comment = null)
        {
            if (workItems == null) throw new ArgumentNullException(nameof(workItems));

            var stats = new SprintEvaluationStatisticsDto
            {
                SprintName = sprintName,
                Comment = comment
            };

            // --- Bild 1: Story points per status + totals ---

            var byStatus = workItems
                .GroupBy(w => MapToStatusCategory(w.StateEnum))
                .ToDictionary(g => g.Key, g => g.ToList());

            stats.NotStartedStoryPoints = SumStoryPoints(byStatus, SprintStatusCategory.NotStarted);
            stats.ActiveStoryPoints = SumStoryPoints(byStatus, SprintStatusCategory.Active);
            stats.ResolvedStoryPoints = SumStoryPoints(byStatus, SprintStatusCategory.Resolved);
            stats.ClosedStoryPoints = SumStoryPoints(byStatus, SprintStatusCategory.Closed);

            stats.UserStoryCount = workItems.Count(w => w.TypeEnum == WorkItemType.UserStory);
            stats.BugCount = workItems.Count(w => w.TypeEnum == WorkItemType.Bug);

            // --- Bild 2: Sprintplanering / Tillkom under sprinten / Klart ---

            var userStories = workItems
                .Where(w => w.TypeEnum == WorkItemType.UserStory)
                .ToList();

            var bugs = workItems
                .Where(w => w.TypeEnum == WorkItemType.Bug)
                .ToList();

            stats.UserStoryStats = BuildScopeStatsForCount(userStories, sprintStart, sprintEnd);
            stats.BugStats = BuildScopeStatsForCount(bugs, sprintStart, sprintEnd);

            // För story points tar vi både US och buggar, men summerar SPInt.
            var usAndBugs = userStories.Concat(bugs).ToList();
            stats.StoryPointStats = BuildScopeStatsForStoryPoints(usAndBugs, sprintStart, sprintEnd);

            return stats;
        }

        // --- Hjälpmetoder för bild 1 ---

        private static SprintStatusCategory MapToStatusCategory(WorkItemState state)
        {
            // Anpassa efter dina enums
            return state switch
            {
                WorkItemState.New =>
                    SprintStatusCategory.NotStarted,

                WorkItemState.Active =>
                    SprintStatusCategory.Active,

                WorkItemState.Resolved =>
                    SprintStatusCategory.Resolved,

                WorkItemState.Closed or WorkItemState.Done =>
                    SprintStatusCategory.Closed,

                _ => SprintStatusCategory.Active // fallback, hellre "aktiv" än att tappa bort något
            };
        }

        private static int SumStoryPoints(
            IDictionary<SprintStatusCategory, List<WorkItemDto>> byStatus,
            SprintStatusCategory category)
        {
            return byStatus.TryGetValue(category, out var list)
                ? list.Sum(w => w.SPInt)
                : 0;
        }

        // --- Hjälpmetoder för bild 2 ---

        private static SprintScopeStats BuildScopeStatsForCount(
            IReadOnlyCollection<WorkItemDto> items,
            DateTime sprintStart,
            DateTime sprintEnd)
        {
            var result = new SprintScopeStats
            {
                Planned = items.Count(w => w.CreatedDate < sprintStart),
                AddedDuringSprint = items.Count(w =>
                    w.CreatedDate >= sprintStart && w.CreatedDate <= sprintEnd),
                Done = items.Count(w =>
                    w.ClosedDate.HasValue &&
                    w.ClosedDate.Value >= sprintStart &&
                    w.ClosedDate.Value <= sprintEnd)
            };

            return result;
        }

        private static SprintScopeStats BuildScopeStatsForStoryPoints(
            IReadOnlyCollection<WorkItemDto> items,
            DateTime sprintStart,
            DateTime sprintEnd)
        {
            var result = new SprintScopeStats
            {
                Planned = items
                    .Where(w => w.CreatedDate < sprintStart)
                    .Sum(w => w.SPInt),

                AddedDuringSprint = items
                    .Where(w => w.CreatedDate >= sprintStart && w.CreatedDate <= sprintEnd)
                    .Sum(w => w.SPInt),

                Done = items
                    .Where(w => w.ClosedDate.HasValue &&
                                w.ClosedDate.Value >= sprintStart &&
                                w.ClosedDate.Value <= sprintEnd)
                    .Sum(w => w.SPInt)
            };

            return result;
        }

        // --- 3. Skriv ned allt till en textfil ---

        public static void WriteSprintStatisticsToTextFile(
            List<WorkItemDto> workItems,
            SprintEvaluationStatisticsDto stats,
            string filePath)
        {
            if (stats == null) throw new ArgumentNullException(nameof(stats));
            if (string.IsNullOrWhiteSpace(filePath)) throw new ArgumentNullException(nameof(filePath));

            var sb = new StringBuilder();

            if (!string.IsNullOrWhiteSpace(stats.SprintName))
            {
                sb.AppendLine(stats.SprintName);
                sb.AppendLine(new string('=', stats.SprintName.Length));
                sb.AppendLine();
            }

            sb.AppendLine("**Bild 1 – Jämförelse mellan uppskattade och levererade Story Points**");
            sb.AppendLine($"Uppskattat (totalt): {stats.EstimatedStoryPoints} SP");
            sb.AppendLine($"Levererat (Closed): {stats.DeliveredStoryPoints} SP");
            sb.AppendLine($"Avvikelse: {stats.VarianceStoryPoints} SP ({stats.VariancePercent:+0.0;-0.0;0.0}%)");
            sb.AppendLine();
            sb.AppendLine($"Ej påbörjade: {stats.NotStartedStoryPoints} SP");
            sb.AppendLine($"Aktiva:       {stats.ActiveStoryPoints} SP");
            sb.AppendLine($"Resolved:     {stats.ResolvedStoryPoints} SP");
            sb.AppendLine($"Closed:       {stats.ClosedStoryPoints} SP");
            sb.AppendLine();
            sb.AppendLine($"Antal User Stories: {stats.UserStoryCount}");
            sb.AppendLine($"Antal Buggar:       {stats.BugCount}");
            sb.AppendLine();

            sb.AppendLine("**Bild 2 – 26.1 Sprint X (US / Bug / SP)**");
            sb.AppendLine();
            sb.AppendLine("User Stories (US):");
            sb.AppendLine($"  Sprintplanering:        {stats.UserStoryStats.Planned}");
            sb.AppendLine($"  Tillkom under sprinten: {stats.UserStoryStats.AddedDuringSprint}");
            sb.AppendLine($"  Klart:                  {stats.UserStoryStats.Done}");
            sb.AppendLine();

            sb.AppendLine("Buggar:");
            sb.AppendLine($"  Sprintplanering:        {stats.BugStats.Planned}");
            sb.AppendLine($"  Tillkom under sprinten: {stats.BugStats.AddedDuringSprint}");
            sb.AppendLine($"  Klart:                  {stats.BugStats.Done}");
            sb.AppendLine();

            sb.AppendLine("Story Points (SP – US + Bug):");
            sb.AppendLine($"  Sprintplanering:        {stats.StoryPointStats.Planned}");
            sb.AppendLine($"  Tillkom under sprinten: {stats.StoryPointStats.AddedDuringSprint}");
            sb.AppendLine($"  Klart:                  {stats.StoryPointStats.Done}");
            sb.AppendLine();

            if (!string.IsNullOrWhiteSpace(stats.Comment))
            {
                sb.AppendLine("Kommentar:");
                sb.AppendLine(stats.Comment);
                sb.AppendLine();
            }

            //Lista på alla work items (valfritt, kan bli väldigt långt)
            sb.AppendLine("Detaljerade Work Items:");
            foreach (var item in workItems)
            {
                sb.AppendLine($"- [{item.Id}] {item.Title} ({item.Type}, {item.State}, {item.SPInt} SP), Dev: {item.AssignedTo}");
            }

            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
            File.WriteAllText(filePath, sb.ToString(), Encoding.UTF8);
        }
    }
}
