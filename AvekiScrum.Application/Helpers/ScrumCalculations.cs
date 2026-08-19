using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Helpers
{
    public class ScrumCalculations
    {
        public static int BusinessDaysInclusive(DateTime start, DateTime end)
        {
            if (end < start) return 0;
            int days = 0;
            for (var d = start.Date; d <= end.Date; d = d.AddDays(1))
                if (d.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday)
                    days++;
            return days;
        }

        public static double AvailableDays(SprintCapacityPlanDto plan)
        {
            return AvailableDays(plan.SprintStartDate, plan.SprintEndDate, plan.Leaves);
        }

        public static double AvailableDays(DateTime start, DateTime end, IEnumerable<DeveloperLeave> leaves)
        {
            var businessDays = BusinessDaysInclusive(start, end);
            var hours = leaves?.Sum(l => l.Hours) ?? 0.0;
            return businessDays - (hours / 8.0);
        }
    }

    public static class SprintCapacityPlansExtensions
    {
        /// <summary>
        /// Returns the total planned capacity (rounded to nearest int).
        /// </summary>
        public static int GetTotalPlannedCapacity(this IEnumerable<SprintCapacityPlanDto> plans)
        {
            if (plans == null)
                return 0;

            var sum = plans
                .Where(p => p.PlannedCapacitySP.HasValue)
                .Sum(p => p.PlannedCapacitySP.Value);

            return (int)Math.Round(sum);
        }

        /// <summary>
        /// Returns the total estimated capacity (rounded to nearest int).
        /// </summary>
        public static int GetTotalEstimatedCapacity(this IEnumerable<SprintCapacityPlanDto> plans)
        {
            if (plans == null)
                return 0;

            var sum = plans
                .Where(p => p.EstimatedCapacitySP.HasValue)
                .Sum(p => p.EstimatedCapacitySP.Value);

            return (int)Math.Round(sum);
        }

        /// <summary>
        /// Returns the total actual capacity, SP per user (rounded to nearest int).
        /// </summary>
        public static int GetTotalActualCapacity(this IEnumerable<SprintCapacityPlanDto> plans)
        {
            if (plans == null)
                return 0;

            var sum = plans
                .Where(p => p.ActualCapacitySP.HasValue)
                .Sum(p => p.ActualCapacitySP.Value);

            return (int)Math.Round(sum);
        }

        //Get total available days for all plans
        public static double GetTotalAvailableDays(this IEnumerable<SprintCapacityPlanDto> plans)
        {
            if (plans == null)
                return 0;
            return plans.Sum(p => ScrumCalculations.AvailableDays(p));
        }
    }

    public static class SprintBacklogExtensions
    {
        private static bool IsDone(string state)
        {
            return state.Equals("Closed", StringComparison.OrdinalIgnoreCase)
                || state.Equals("Done", StringComparison.OrdinalIgnoreCase)
                || state.Equals("Resolved", StringComparison.OrdinalIgnoreCase);
        }

        public static int GetTotalStories(this IEnumerable<WorkItemDto> items)
            => items.Count(wi => wi.Type == "User Story");

        public static int GetStoriesDone(this IEnumerable<WorkItemDto> items)
            => items.Count(wi => wi.Type == "User Story" && IsDone(wi.State));

        public static int GetTotalBugs(this IEnumerable<WorkItemDto> items)
            => items.Count(wi => wi.Type == "Bug");

        public static int GetBugsDone(this IEnumerable<WorkItemDto> items)
            => items.Count(wi => wi.Type == "Bug" && IsDone(wi.State));
        
        public static int GetTotalPoints(this IEnumerable<WorkItemDto> items)
            => (int)Math.Round(items.Sum(wi => wi.StoryPoints ?? 0.0));

        public static int GetPointsDone(this IEnumerable<WorkItemDto> items)
            => (int)Math.Round(items.Where(wi => IsDone(wi.State)).Sum(wi => wi.StoryPoints ?? 0.0));

        /// <summary>
        /// Summerar story points per utvecklare (AssignedTo).
        /// </summary>
        public static Dictionary<string, double> GetPointsByAssignee(this IEnumerable<WorkItemDto> items)
        {
            return items
                .GroupBy(wi => wi.AssignedTo ?? "Unassigned")
                .ToDictionary(
                    g => g.Key,
                    g => g.Sum(wi => wi.StoryPoints ?? 0.0)
                );
        }

        /// <summary>
        /// Summerar story points per work item state.
        /// </summary>
        public static Dictionary<string, double> GetPointsByState(this IEnumerable<WorkItemDto> items)
        {
            return items
                .GroupBy(wi => wi.State ?? "Unknown")
                .ToDictionary(
                    g => g.Key,
                    g => g.Sum(wi => wi.StoryPoints ?? 0.0)
                );
        }
    }
}
