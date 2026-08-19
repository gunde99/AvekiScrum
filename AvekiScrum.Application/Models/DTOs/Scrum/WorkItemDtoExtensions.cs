using System;
using System.Collections.Generic;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Shared.Extensions;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public static class WorkItemDtoExtensions
    {
        public enum MatchKind
        {
            None = 0,
            Closed = 1,
            Resolved = 2
        }

        public const string Tag_Demo = "Demo";
        public const string Tag_SprintReview = "Sprint Review";

        // ====== Date helpers (UTC-normalisering) ======

        /// <summary>
        /// Konvertera ett DateTime (vilken Kind som helst) till DateTimeOffset i UTC.
        /// Om Kind är Unspecified antar vi Local (byt vid behov till org-specifik TZ).
        /// </summary>
        public static DateTimeOffset ToUtcOffset(this DateTime dt, TimeZoneInfo? assumeIfUnspecified = null)
        {
            assumeIfUnspecified ??= TimeZoneInfo.Local;

            return dt.Kind switch
            {
                DateTimeKind.Utc => new DateTimeOffset(dt, TimeSpan.Zero),                  // redan UTC
                DateTimeKind.Local => new DateTimeOffset(dt).ToUniversalTime(),               // konvertera till UTC
                DateTimeKind.Unspecified => TimeZoneInfo.ConvertTimeToUtc(dt, assumeIfUnspecified). // tolka som given TZ
                                            ToOffset(),                                           // till DTO UTC
                _ => new DateTimeOffset(dt).ToUniversalTime()
            };
        }

        /// <summary>
        /// Gör DateTimeOffset i UTC (säker variant).
        /// </summary>
        public static DateTimeOffset ToOffset(this DateTime utc)
            => utc.Kind == DateTimeKind.Utc
                ? new DateTimeOffset(utc, TimeSpan.Zero)
                : new DateTimeOffset(utc).ToUniversalTime();



        /// <summary>
        /// Gör DateTimeOffset i UTC (säker variant).
        /// </summary>
        public static DateTimeOffset ToOffset(this DateTime? utc)
            => utc.HasValue
                ? utc.Value.ToOffset()
                : DateTimeOffset.MinValue;

        /// <summary>
        /// Returnerar sprintfönster i UTC: [StartUtc, EndUtc)
        /// End görs exklusiv. Om EndDate saknar tid används nästa dags 00:00.
        /// </summary>
        public static (DateTimeOffset StartUtc, DateTimeOffset EndUtc) GetSprintWindowUtc(this Sprint sprint, TimeZoneInfo? assumeIfUnspecified = null)
        {
            if (sprint == null) throw new ArgumentNullException(nameof(sprint));

            // Start
            var startUtc = sprint.StartDate.ToUtcOffset(assumeIfUnspecified);

            // End: om EndDate har 00:00 (ingen tid) → nästa midnatt
            var endBase = sprint.EndDate;
            var endDateTime = endBase.TimeOfDay == TimeSpan.Zero
                ? endBase.Date.AddDays(1)
                : endBase;

            var endUtc = endDateTime.ToUtcOffset(assumeIfUnspecified);
            return (startUtc, endUtc);
        }

        // ====== Work item matchning ======

        /// <summary>
        /// UTC-tid då kortet stängdes under sprintfönstret, annars null.
        /// </summary>
        public static DateTimeOffset? ClosedTimestampIn(this WorkItemDto wi, Sprint sprint, TimeZoneInfo? assumeIfUnspecified = null)
        {
            if (wi == null || sprint == null) return null;
            var (startUtc, endUtc) = sprint.GetSprintWindowUtc(assumeIfUnspecified);

            // ClosedDate i första hand
            if (wi.StateEnum == WorkItemState.Closed && wi.ClosedDate.HasValue)
            {
                var tsUtc = wi.ClosedDate.Value.ToUtcOffset(assumeIfUnspecified);
                if (tsUtc >= startUtc && tsUtc < endUtc) return tsUtc;
            }

            // Fallback: ChangedDate om state är Closed
            if (wi.StateEnum == WorkItemState.Closed && wi.ChangedDate.HasValue)
            {
                var tsUtc = wi.ChangedDate.Value.ToUtcOffset(assumeIfUnspecified);
                if (tsUtc >= startUtc && tsUtc < endUtc) return tsUtc;
            }

            return null;
        }

        /// <summary>
        /// UTC-tid då kortet blev Resolved under sprintfönstret, annars null.
        /// </summary>
        public static DateTimeOffset? ResolvedTimestampIn(this WorkItemDto wi, Sprint sprint, TimeZoneInfo? assumeIfUnspecified = null)
        {
            if (wi == null || sprint == null) return null;
            var (startUtc, endUtc) = sprint.GetSprintWindowUtc(assumeIfUnspecified);

            if (wi.ResolvedDate.HasValue)
            {
                var tsUtc = wi.ResolvedDate.Value.ToUtcOffset(assumeIfUnspecified);
                if (tsUtc >= startUtc && tsUtc < endUtc) return tsUtc;
            }

            if ((wi.State?.Equals("Resolved", StringComparison.OrdinalIgnoreCase) ?? false) && wi.ChangedDate.HasValue)
            {
                var tsUtc = wi.ChangedDate.Value.ToUtcOffset(assumeIfUnspecified);
                if (tsUtc >= startUtc && tsUtc < endUtc) return tsUtc;
            }

            return null;
        }

        //UTC-tid då kortet skapades
        public static DateTimeOffset CreatedTimestampUtc(this WorkItemDto wi, TimeZoneInfo? assumeIfUnspecified = null)
            => wi?.CreatedDate.ToUtcOffset(assumeIfUnspecified) ?? DateTimeOffset.MinValue;

        public static bool IsClosedIn(this WorkItemDto wi, Sprint sprint, TimeZoneInfo? assumeIfUnspecified = null)
            => wi.ClosedTimestampIn(sprint, assumeIfUnspecified).HasValue;

        public static bool IsResolvedIn(this WorkItemDto wi, Sprint sprint, TimeZoneInfo? assumeIfUnspecified = null)
            => wi.ResolvedTimestampIn(sprint, assumeIfUnspecified).HasValue;

        /// <summary>
        /// Returnerar matchtyp + UTC-tid. Om båda matchar väljer vi Closed.
        /// </summary>
        public static (MatchKind Kind, DateTimeOffset TimestampUtc) MatchInSprint(this WorkItemDto wi, Sprint sprint, TimeZoneInfo? assumeIfUnspecified = null)
        {
            var closed = wi.ClosedTimestampIn(sprint, assumeIfUnspecified);
            if (closed.HasValue) return (MatchKind.Closed, closed.Value);

            var resolved = wi.ResolvedTimestampIn(sprint, assumeIfUnspecified);
            if (resolved.HasValue) return (MatchKind.Resolved, resolved.Value);

            return (MatchKind.None, default);
        }

        public static string AssignedDisplay(this WorkItemDto wi)
            => string.IsNullOrWhiteSpace(wi?.AssignedTo) ? "okänd utvecklare" : wi!.AssignedTo.Trim();

        public static double StoryPointsOrZero(this WorkItemDto wi)
            => wi?.StoryPoints is double d ? d : 0d;


        public static bool IsBug(this WorkItemDto wi)
            => wi.TypeEnum == WorkItemType.Bug
               || (wi.Type?.Equals("Bug", StringComparison.OrdinalIgnoreCase) ?? false);

        public static bool IsUserStory(this WorkItemDto wi)
            => wi.TypeEnum == WorkItemType.UserStory
               || (wi.Type?.Equals("User Story", StringComparison.OrdinalIgnoreCase) ?? false)
               || (wi.Type?.Equals("UserStory", StringComparison.OrdinalIgnoreCase) ?? false);


        public static bool ContainsTag(this WorkItemDto wi, string tag)
        {
            if (wi == null || string.IsNullOrWhiteSpace(tag) || wi.Tags == null)
                return false;
            var normalizedTag = tag.Normalize();
            foreach (var t in wi.Tags)
            {
                if (t.Trim().ToLowerInvariant() == normalizedTag)
                    return true;
            }
            return false;
        }

        //many tags
        public static bool ContainsAnyTag(this WorkItemDto wi, List<string> tags)
        {
            if (wi == null || tags == null || tags.Count == 0 || wi.Tags == null)
                return false;
            var normalizedTags = tags.Normalize();
            foreach (var normalizedTag in wi.Tags)
            {
                if (normalizedTags.Contains(normalizedTag))
                    return true;
            }
            return false;
        }

        public static string TagsTextOrNull(this WorkItemDto wi)
            => wi.Tags == null || wi.Tags.Count == 0 ? null : string.Join(";", wi.Tags);
    }
}
