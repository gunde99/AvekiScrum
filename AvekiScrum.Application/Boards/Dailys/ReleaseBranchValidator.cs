using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Application.Models.Sprintbacklog;

namespace AvekiScrum.Application.Boards.Dailys
{
    internal sealed record ReleaseBranchValidationResult(List<string> Warnings)
    {
        public static ReleaseBranchValidationResult Empty { get; } = new(new List<string>());
    }

    internal static class ReleaseBranchValidator
    {
        private static readonly Regex ReleaseTagPattern = new(
            @"(?<!\d)(?<version>(?:20)?\d{2}\.[12])(?!\d)",
            RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

        private static readonly Lazy<ReleaseBranchSettings> Settings = new(ReleaseBranchSettings.Load);

        public static ReleaseBranchValidationResult Evaluate(
            StoryVm story,
            WorkItemDto? source,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> pullRequestDetails)
        {
            var settings = Settings.Value;
            var releaseTags = ExtractReleaseTags(story, source).ToList();
            var pullRequests = story.PullRequests?.ToList() ?? new List<PullRequestCardVm>();

            if (!ShouldValidate(story, source))
                return ReleaseBranchValidationResult.Empty;

            var expectedBranches = new[] { settings.MainExpectedBranch(null) }
                .Concat(releaseTags.Select(tag => settings.ExpectedBranchForTag(tag)))
                .DistinctBy(expected => string.Join("|", expected.NormalizedBranches), StringComparer.OrdinalIgnoreCase)
                .ToList();

            var actualBranches = pullRequests
                .Select(pr => GetPullRequestBranch(pr, pullRequestDetails))
                .ToList();

            var warnings = new List<string>();
            if (actualBranches.Count == 0)
            {
                warnings.Add($"Release-branch: Saknas PR mot {settings.MainBranchDisplay}.");
                return new ReleaseBranchValidationResult(warnings);
            }

            foreach (var expected in expectedBranches)
            {
                if (actualBranches.Any(actual => actual.MatchesAny(expected.NormalizedBranches)))
                    continue;

                warnings.Add(MissingBranchWarning(expected, settings));
            }

            foreach (var actual in actualBranches.Where(actual => !string.IsNullOrWhiteSpace(actual.DisplayBranch)))
            {
                if (expectedBranches.Any(expected => actual.MatchesAny(expected.NormalizedBranches)))
                    continue;

                warnings.Add($"Release-branch: PR mot {actual.DisplayBranch} saknar motsvarande release-tagg.");
            }

            return warnings.Count == 0
                ? ReleaseBranchValidationResult.Empty
                : new ReleaseBranchValidationResult(warnings.Distinct(StringComparer.OrdinalIgnoreCase).ToList());
        }

        private static bool ShouldValidate(StoryVm story, WorkItemDto? source)
        {
            if (source?.StateEnum is WorkItemState.Resolved or WorkItemState.Closed or WorkItemState.Done)
                return true;

            if (source != null)
            {
                var state = source.State ?? string.Empty;
                return TextEquals(state, "Resolved") || TextEquals(state, "Closed") || TextEquals(state, "Done");
            }

            return story.CompletedDate.HasValue || story.Stage == StoryStage.Done;
        }

        private static IEnumerable<string> ExtractReleaseTags(StoryVm story, WorkItemDto? source)
        {
            var tags = new List<string>();
            if (source?.Tags != null)
                tags.AddRange(source.Tags);

            if (story.Tags != null)
                tags.AddRange(story.Tags);

            foreach (var task in story.Tasks ?? new System.ComponentModel.BindingList<TaskVm>())
            {
                if (task.Tags != null)
                    tags.AddRange(task.Tags);
            }

            return tags
                .SelectMany(tag => ReleaseTagPattern.Matches(tag ?? string.Empty)
                    .Select(match => NormalizeVersion(match.Groups["version"].Value)))
                .Where(tag => !string.IsNullOrWhiteSpace(tag))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(tag => tag, StringComparer.OrdinalIgnoreCase);
        }

        private static PullRequestBranch GetPullRequestBranch(
            PullRequestCardVm pullRequest,
            IReadOnlyDictionary<(Guid RepoId, int PullRequestId), PullRequestDetails> pullRequestDetails)
        {
            pullRequestDetails.TryGetValue((pullRequest.RepoId, pullRequest.PullRequestId), out var details);
            return new PullRequestBranch(
                pullRequest.PullRequestId,
                details?.TargetBranch ?? string.Empty);
        }

        private static string MissingBranchWarning(
            ExpectedReleaseBranch expected,
            ReleaseBranchSettings settings)
        {
            if (expected.Tag == null)
                return $"Release-branch: Saknas PR mot {settings.MainBranchDisplay}.";

            return $"Release-branch: Kort taggade med {expected.Tag} saknar PR mot {expected.DisplayBranch}.";
        }

        private static bool TextEquals(string actual, string expected)
            => string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);

        private static string NormalizeVersion(string value)
        {
            var version = value.Trim();
            return version.StartsWith("20", StringComparison.OrdinalIgnoreCase) && version.Length == 6
                ? version.Substring(2)
                : version;
        }
    }

    internal sealed class ReleaseBranchSettings
    {
        public IReadOnlyList<BranchName> MainBranches { get; init; } = new[] { BranchName.From("main"), BranchName.From("master") };
        public string ReleaseBranchPrefix { get; init; } = "release\\";
        public IReadOnlyDictionary<string, DateOnly> ReleaseDates { get; init; } =
            new Dictionary<string, DateOnly>(StringComparer.OrdinalIgnoreCase);
        public string CurrentBetaRelease { get; init; } = string.Empty;
        public string MainBranchDisplay => string.Join("/", MainBranches.Select(branch => branch.DisplayBranch));

        public static ReleaseBranchSettings Load()
        {
            var configuration = new ConfigurationBuilder()
                .SetBasePath(AppContext.BaseDirectory)
                .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
                .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false)
                .Build();

            var section = configuration.GetSection("ReleaseBranchValidation");
            var mainBranches = new[] { section["MainBranch"] ?? "main" }
                .Concat(section.GetSection("MainBranchAliases").GetChildren().Select(child => child.Value ?? ""))
                .Concat(new[] { "master" })
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(BranchName.From)
                .GroupBy(branch => branch.NormalizedBranch, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .ToList();
            var releaseBranchPrefix = section["ReleaseBranchPrefix"] ?? "release\\";
            var releases = new Dictionary<string, DateOnly>(StringComparer.OrdinalIgnoreCase);

            foreach (var child in section.GetSection("Releases").GetChildren())
            {
                var version = NormalizeVersion(child["Version"] ?? "");
                var releaseDate = child["ReleaseDate"];
                if (string.IsNullOrWhiteSpace(version) || string.IsNullOrWhiteSpace(releaseDate))
                    continue;

                if (DateOnly.TryParseExact(
                        releaseDate,
                        "yyyy-MM-dd",
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.None,
                        out var parsed))
                {
                    releases[version] = parsed;
                }
            }

            return new ReleaseBranchSettings
            {
                MainBranches = mainBranches,
                ReleaseBranchPrefix = releaseBranchPrefix,
                ReleaseDates = releases,
                CurrentBetaRelease = NormalizeVersion(section["CurrentBetaRelease"] ?? string.Empty)
            };
        }

        public ExpectedReleaseBranch MainExpectedBranch(string? tag)
            => new(
                tag,
                MainBranchDisplay,
                MainBranches.Select(branch => branch.NormalizedBranch).ToList());

        public ExpectedReleaseBranch ExpectedBranchForTag(string tag)
        {
            var normalizedTag = NormalizeVersion(tag);
            if (!string.IsNullOrWhiteSpace(CurrentBetaRelease) &&
                CompareVersions(normalizedTag, CurrentBetaRelease) >= 0)
            {
                return MainExpectedBranch(normalizedTag);
            }

            if (!ReleaseDates.TryGetValue(normalizedTag, out var releaseDate) ||
                releaseDate > DateOnly.FromDateTime(DateTime.Today))
            {
                return MainExpectedBranch(normalizedTag);
            }

            var branch = BranchName.From(ReleaseBranchPrefix + ExpandYear(normalizedTag));
            return new ExpectedReleaseBranch(normalizedTag, branch.DisplayBranch, new[] { branch.NormalizedBranch });
        }

        private static string NormalizeVersion(string value)
        {
            var version = value.Trim();
            return version.StartsWith("20", StringComparison.OrdinalIgnoreCase) && version.Length == 6
                ? version.Substring(2)
                : version;
        }

        private static int CompareVersions(string left, string right)
        {
            var leftParts = ExpandYear(NormalizeVersion(left)).Split('.');
            var rightParts = ExpandYear(NormalizeVersion(right)).Split('.');
            var leftMajor = int.TryParse(leftParts.ElementAtOrDefault(0), out var lm) ? lm : 0;
            var leftMinor = int.TryParse(leftParts.ElementAtOrDefault(1), out var ln) ? ln : 0;
            var rightMajor = int.TryParse(rightParts.ElementAtOrDefault(0), out var rm) ? rm : 0;
            var rightMinor = int.TryParse(rightParts.ElementAtOrDefault(1), out var rn) ? rn : 0;
            return leftMajor != rightMajor
                ? leftMajor.CompareTo(rightMajor)
                : leftMinor.CompareTo(rightMinor);
        }

        private static string ExpandYear(string version)
        {
            if (version.Length == 4 && version[2] == '.')
                return "20" + version;

            return version;
        }
    }

    internal sealed record ExpectedReleaseBranch(string? Tag, string DisplayBranch, IReadOnlyList<string> NormalizedBranches);

    internal sealed record PullRequestBranch(int PullRequestId, string DisplayBranch)
    {
        private string NormalizedBranch { get; } = BranchName.Normalize(DisplayBranch);

        public bool MatchesAny(IReadOnlyList<string> expectedBranches)
            => expectedBranches.Any(expectedBranch =>
                string.Equals(NormalizedBranch, expectedBranch, StringComparison.OrdinalIgnoreCase));
    }

    internal sealed record BranchName(string DisplayBranch, string NormalizedBranch)
    {
        public static BranchName From(string branch)
            => new(branch.Trim(), Normalize(branch));

        public static string Normalize(string branch)
        {
            var value = (branch ?? string.Empty)
                .Trim()
                .Replace('\\', '/');

            const string refsHeads = "refs/heads/";
            if (value.StartsWith(refsHeads, StringComparison.OrdinalIgnoreCase))
                value = value.Substring(refsHeads.Length);

            return value.Trim('/');
        }
    }
}
