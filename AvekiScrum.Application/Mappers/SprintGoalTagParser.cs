using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

public static class SprintGoalTagParser
{
    // Matchar:
    // "Sprintmål 1"
    // "Sprintmål:1"
    // "Sprintmål-2"
    // "Sprintmål 03"
    // och även "Sprintmål" utan siffra
    private static readonly Regex Rx = new(
        @"^\s*sprintm[aå]l\s*[:\-]?\s*(?<n>\d+)?\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static string GetSprintGoals(IReadOnlyList<string>? tags)
    {
        if (tags == null || tags.Count == 0)
            return "";

        var matches = new List<(int? Num, string Text)>();

        foreach (var raw in tags)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;

            var m = Rx.Match(raw);
            if (!m.Success) continue;

            int? n = null;
            if (m.Groups["n"].Success && int.TryParse(m.Groups["n"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
                n = parsed;

            // Normalisera presentation
            var text = n.HasValue ? $"Sprintmål {n.Value}" : "Sprintmål";
            matches.Add((n, text));
        }

        if (matches.Count == 0)
            return "";

        // Sortera: numeriska först i ordning, sen ev "Sprintmål" utan nummer sist
        var ordered = matches
            .OrderBy(x => x.Num.HasValue ? 0 : 1)
            .ThenBy(x => x.Num ?? int.MaxValue)
            .Select(x => x.Text)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Om du vill ha exakt en: ta första
        return ordered.First();

        // Om du vill visa alla:
        //return string.Join(", ", ordered);
    }

    // Om du vill ha ett rent int för grouping:
    public static int? GetFirstSprintGoalNumber(IReadOnlyList<string>? tags)
    {
        if (tags == null) return null;

        foreach (var raw in tags)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            var m = Rx.Match(raw);
            if (!m.Success) continue;

            if (m.Groups["n"].Success && int.TryParse(m.Groups["n"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
                return n;

            // om taggen bara är "Sprintmål" utan nummer
            return null;
        }

        return null;
    }

    public static int GetFirstNumberFromSprintGoalText(string? sprintGoal)
    {
        if (string.IsNullOrWhiteSpace(sprintGoal)) return int.MaxValue;

        // plocka första talet i texten
        var m = Regex.Match(sprintGoal, @"\d+");
        return m.Success && int.TryParse(m.Value, out var n) ? n : int.MaxValue;
    }
}
