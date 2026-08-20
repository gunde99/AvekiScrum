using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Services
{
    /// <summary>
    /// Läser Aveki:s sprintmålstabeller från Markdown i Azure DevOps Wiki.
    /// Parsern är fri från nätverkskod och kan därför testas separat.
    /// </summary>
    public static class PlanningSprintGoalMarkdownParser
    {
        private static readonly Regex HeadingPattern = new(
            @"^\s*(?<marks>#{1,6})\s*(?<title>.*?)\s*#*\s*$",
            RegexOptions.Compiled);

        private static readonly Regex DocumentHeadingPattern = new(
            @"^[ \t]*(?<marks>#{1,6})[ \t]*(?<title>.*?)[ \t]*#*[ \t]*\r?$",
            RegexOptions.Compiled | RegexOptions.Multiline);

        private static readonly Regex BreakPattern = new(
            @"<br\s*/?>",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex LinkPattern = new(
            @"!?\[(?<label>[^\]]*)\]\([^)]+\)",
            RegexOptions.Compiled);

        private static readonly Regex HtmlTagPattern = new(
            @"<[^>]+>",
            RegexOptions.Compiled);

        private static readonly Regex WorkItemPattern = new(
            @"#\s*(?<id>\d+)\b",
            RegexOptions.Compiled);

        private static readonly Regex WorkItemUrlPattern = new(
            @"/(?:_workitems/edit|workitems)/(?<id>\d+)\b",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex LeadingWorkItemPattern = new(
            @"^\s*(?<id>\d{5,})\b",
            RegexOptions.Compiled | RegexOptions.Multiline);

        private static readonly Regex NumberPattern = new(
            @"\d+",
            RegexOptions.Compiled);

        private static readonly Regex HtmlTablePattern = new(
            @"<table\b[^>]*>(?<content>[\s\S]*?)</table>",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex HtmlRowPattern = new(
            @"<tr\b[^>]*>(?<content>[\s\S]*?)</tr>",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex HtmlCellPattern = new(
            @"<(?<tag>th|td)\b(?<attributes>[^>]*)>(?<content>[\s\S]*?)</\k<tag>>",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly Regex PriorityPattern = new(
            @"^\s*(?:🔴|🔵|🟡|🟢)?\s*P(?<priority>[1-4])\s*(?:[-–—:]\s*)?",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public static IReadOnlyList<PlanningSprintGoal> Parse(
            string markdown,
            DeveloperTeam team)
        {
            if (string.IsNullOrWhiteSpace(markdown))
                return Array.Empty<PlanningSprintGoal>();

            var section = FindSection(markdown, TeamHeadings(team));
            if (section == null)
                return Array.Empty<PlanningSprintGoal>();

            if (team == DeveloperTeam.Nord)
            {
                var htmlGoals = ParseNordHtmlTable(section, out var foundNordTable);
                if (foundNordTable)
                    return htmlGoals;
            }

            return ParseTable(section, team);
        }

        /// <summary>
        /// Ersätter endast det valda teamets Wiki-sektion. Om rubriken eller
        /// tabellen saknas skapas den utan att övriga sektioner ändras.
        /// </summary>
        public static string UpsertTeamSection(
            string? markdown,
            DeveloperTeam team,
            IReadOnlyCollection<PlanningSprintGoal> goals)
        {
            ArgumentNullException.ThrowIfNull(goals);

            var existing = markdown ?? string.Empty;
            var headingsForTeam = TeamHeadings(team);
            var newLine = existing.Contains("\r\n", StringComparison.Ordinal)
                ? "\r\n"
                : "\n";
            var headings = DocumentHeadingPattern.Matches(existing)
                .Cast<Match>()
                .ToArray();
            var targetIndex = Array.FindIndex(headings, match =>
                headingsForTeam.Any(heading => string.Equals(
                    CleanCell(match.Groups["title"].Value),
                    heading,
                    StringComparison.OrdinalIgnoreCase)));

            if (targetIndex < 0)
            {
                var section = RenderTeamSection(team, goals, 1, newLine);
                if (string.IsNullOrWhiteSpace(existing))
                    return section + newLine;

                var separator = existing.EndsWith(newLine + newLine, StringComparison.Ordinal)
                    ? string.Empty
                    : existing.EndsWith(newLine, StringComparison.Ordinal)
                        ? newLine
                        : newLine + newLine;
                return existing + separator + section + newLine;
            }

            var target = headings[targetIndex];
            var level = target.Groups["marks"].Value.Length;
            var end = headings
                .Skip(targetIndex + 1)
                .FirstOrDefault(match => match.Groups["marks"].Value.Length <= level)
                ?.Index ?? existing.Length;
            var replacement = RenderTeamSection(team, goals, level, newLine);
            var suffix = existing[end..];
            var sectionSeparator = suffix.Length == 0 ? newLine : newLine + newLine;

            return existing[..target.Index] + replacement + sectionSeparator + suffix;
        }

        private static string? FindSection(
            string markdown,
            IReadOnlyCollection<string> headings)
        {
            var lines = NormalizeNewLines(markdown).Split('\n');
            var content = new StringBuilder();
            var found = false;
            var headingLevel = 0;

            foreach (var line in lines)
            {
                var match = HeadingPattern.Match(line);
                if (match.Success)
                {
                    var currentLevel = match.Groups["marks"].Value.Length;
                    if (found && currentLevel <= headingLevel)
                        break;

                    if (!found)
                    {
                        var title = CleanCell(match.Groups["title"].Value);
                        found = headings.Any(heading => string.Equals(
                            title,
                            heading,
                            StringComparison.OrdinalIgnoreCase));
                        if (found)
                            headingLevel = currentLevel;
                        continue;
                    }
                }

                if (found)
                    content.AppendLine(line);
            }

            return found ? content.ToString() : null;
        }

        private static IReadOnlyList<PlanningSprintGoal> ParseNordHtmlTable(
            string section,
            out bool foundNordTable)
        {
            foundNordTable = false;
            foreach (Match tableMatch in HtmlTablePattern.Matches(section))
            {
                var rows = HtmlRowPattern.Matches(
                        tableMatch.Groups["content"].Value)
                    .Cast<Match>()
                    .Select(match => ParseHtmlCells(match.Groups["content"].Value))
                    .Where(cells => cells.Count > 0)
                    .ToArray();
                var headerIndex = Array.FindIndex(rows, cells =>
                {
                    var headers = cells.Select(cell => NormalizeHeader(cell.Content))
                        .ToArray();
                    return headers.Contains("nr") &&
                           headers.Contains("epic") &&
                           headers.Contains("mål") &&
                           headers.Contains("beskrivning") &&
                           headers.Contains("workitem");
                });
                if (headerIndex < 0)
                    continue;

                foundNordTable = true;

                var builders = new List<NordGoalBuilder>();
                NordGoalBuilder? current = null;
                for (var rowIndex = headerIndex + 1; rowIndex < rows.Length; rowIndex++)
                {
                    var cells = rows[rowIndex]
                        .Where(cell => string.Equals(
                            cell.Tag,
                            "td",
                            StringComparison.OrdinalIgnoreCase))
                        .ToArray();
                    if (cells.Length >= 5)
                    {
                        var number = ParseNumber(cells[0].Content);
                        var epicParts = CleanCell(cells[1].Content)
                            .Split('\n', StringSplitOptions.RemoveEmptyEntries |
                                         StringSplitOptions.TrimEntries);
                        if (!number.HasValue || epicParts.Length == 0)
                        {
                            current = null;
                            continue;
                        }

                        current = new NordGoalBuilder(
                            number.Value,
                            epicParts[0],
                            string.Join("\n", epicParts.Skip(1)),
                            builders.Count + 1);
                        builders.Add(current);
                        AddNordSubGoal(current, cells[2], cells[3], cells[4]);
                    }
                    else if (cells.Length >= 3 && current != null)
                    {
                        AddNordSubGoal(current, cells[0], cells[1], cells[2]);
                    }
                }

                return builders.Select(builder => builder.ToGoal()).ToArray();
            }

            return Array.Empty<PlanningSprintGoal>();
        }

        private static IReadOnlyList<ParsedHtmlCell> ParseHtmlCells(string row)
            => HtmlCellPattern.Matches(row)
                .Cast<Match>()
                .Select(match => new ParsedHtmlCell(
                    match.Groups["tag"].Value,
                    match.Groups["attributes"].Value,
                    match.Groups["content"].Value))
                .ToArray();

        private static void AddNordSubGoal(
            NordGoalBuilder goal,
            ParsedHtmlCell titleCell,
            ParsedHtmlCell descriptionCell,
            ParsedHtmlCell workItemCell)
        {
            var title = CleanCell(titleCell.Content)
                .Replace('\n', ' ')
                .Trim();
            var priority = ParsePriority(titleCell.Attributes, ref title);
            var workItemIds = ParseWorkItemIds(workItemCell.Content);
            if (string.IsNullOrWhiteSpace(title) && workItemIds.Count == 0)
                return;

            goal.SubGoals.Add(new PlanningSprintSubGoal(
                $"wiki-nord-{goal.Number}-{goal.Ordinal}-subgoal-{goal.SubGoals.Count + 1}",
                title,
                CleanCell(descriptionCell.Content),
                priority,
                workItemIds));
        }

        private static int? ParsePriority(string attributes, ref string title)
        {
            var attributeMatch = Regex.Match(
                attributes,
                @"\bdata-priority\s*=\s*['""]?(?:P)?(?<priority>[1-4])\b",
                RegexOptions.IgnoreCase);
            var titleMatch = PriorityPattern.Match(title);
            var value = attributeMatch.Success
                ? attributeMatch.Groups["priority"].Value
                : titleMatch.Groups["priority"].Value;
            if (titleMatch.Success)
                title = title[titleMatch.Length..].Trim();
            return int.TryParse(value, out var priority) ? priority : null;
        }

        private static IReadOnlyList<PlanningSprintGoal> ParseTable(
            string section,
            DeveloperTeam team)
        {
            var lines = NormalizeNewLines(section).Split('\n');
            string[]? headers = null;
            var headerLine = -1;

            for (var index = 0; index < lines.Length; index++)
            {
                var cells = SplitTableRow(lines[index]);
                if (cells.Length == 0)
                    continue;

                var normalized = cells.Select(NormalizeHeader).ToArray();
                if (normalized.Contains("mål") &&
                    normalized.Contains("workitem"))
                {
                    headers = normalized;
                    headerLine = index;
                    break;
                }
            }

            if (headers == null)
                return Array.Empty<PlanningSprintGoal>();

            var goalIndex = Array.IndexOf(headers, "mål");
            var descriptionIndex = Array.IndexOf(headers, "beskrivning");
            var areaIndex = Array.IndexOf(headers, "delområde");
            var workItemIndex = Array.IndexOf(headers, "workitem");
            var ownerIndex = Array.IndexOf(headers, "ansvarig");
            var expertIndex = Array.IndexOf(headers, "sakkunnig");
            var deliverablesIndex = Array.IndexOf(headers, "leverabler");
            var definitionOfDoneIndex = Array.IndexOf(headers, "definitionofdone");
            var numberIndex = Enumerable.Range(0, headers.Length)
                .FirstOrDefault(index => string.IsNullOrWhiteSpace(headers[index]));
            var goals = new List<PlanningSprintGoal>();

            for (var index = headerLine + 1; index < lines.Length; index++)
            {
                var cells = SplitTableRow(lines[index]);
                if (cells.Length == 0 || IsSeparatorRow(cells))
                    continue;

                var goalCell = Cell(cells, goalIndex);
                var goalParts = CleanCell(goalCell)
                    .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (goalParts.Length == 0)
                    continue;

                var number = ParseNumber(Cell(cells, numberIndex));
                if (!number.HasValue)
                    number = goals.Count + 1;

                var description = CleanCell(Cell(
                    cells,
                    descriptionIndex >= 0 ? descriptionIndex : areaIndex));
                var owners = ownerIndex < 0
                    ? Array.Empty<string>()
                    : ParseOwners(Cell(cells, ownerIndex));
                var expert = expertIndex < 0
                    ? string.Empty
                    : CleanCell(Cell(cells, expertIndex));
                var deliverables = deliverablesIndex < 0
                    ? Array.Empty<PlanningGoalDeliverable>()
                    : ParseDeliverables(
                        Cell(cells, deliverablesIndex),
                        team,
                        number.Value);
                var definitionOfDone = definitionOfDoneIndex < 0
                    ? Array.Empty<PlanningGoalDoneCriterion>()
                    : ParseDefinitionOfDone(
                        Cell(cells, definitionOfDoneIndex),
                        team,
                        number.Value);
                var workItemIds = ParseWorkItemIds(Cell(cells, workItemIndex));

                goals.Add(new PlanningSprintGoal(
                    $"wiki-{team.ToString().ToLowerInvariant()}-{number.Value}",
                    number.Value,
                    string.Join(" ", goalParts),
                    description,
                    owners,
                    Expert: expert,
                    Deliverables: deliverables,
                    DefinitionOfDone: definitionOfDone,
                    WorkItemIds: workItemIds));
            }

            return goals;
        }

        private static string[] SplitTableRow(string line)
        {
            if (string.IsNullOrWhiteSpace(line) || !line.Contains('|'))
                return Array.Empty<string>();

            var value = line.Trim();
            if (value.StartsWith('|'))
                value = value[1..];
            if (value.EndsWith('|'))
                value = value[..^1];

            var cells = new List<string>();
            var cell = new StringBuilder();
            var escaped = false;

            foreach (var character in value)
            {
                if (escaped)
                {
                    cell.Append(character);
                    escaped = false;
                }
                else if (character == '\\')
                {
                    escaped = true;
                    cell.Append(character);
                }
                else if (character == '|')
                {
                    cells.Add(cell.ToString());
                    cell.Clear();
                }
                else
                {
                    cell.Append(character);
                }
            }

            cells.Add(cell.ToString());
            return cells.ToArray();
        }

        private static bool IsSeparatorRow(IEnumerable<string> cells)
            => cells.All(cell =>
            {
                var value = cell.Trim();
                return value.Length == 0 ||
                       Regex.IsMatch(value, @"^:?-{2,}:?$");
            });

        private static string Cell(IReadOnlyList<string> cells, int index)
            => index >= 0 && index < cells.Count ? cells[index] : string.Empty;

        private static int? ParseNumber(string value)
        {
            var match = NumberPattern.Match(value);
            return match.Success && int.TryParse(match.Value, out var number)
                ? number
                : null;
        }

        private static IReadOnlyCollection<string> ParseOwners(string value)
        {
            var cleaned = CleanCell(value);
            if (string.IsNullOrWhiteSpace(cleaned) ||
                string.Equals(cleaned, "Alla", StringComparison.OrdinalIgnoreCase))
                return Array.Empty<string>();

            return Regex.Split(cleaned, @"\s*(?:&|/|,|\boch\b)\s*",
                    RegexOptions.IgnoreCase)
                .Where(owner => !string.IsNullOrWhiteSpace(owner))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        private static IReadOnlyCollection<int> ParseWorkItemIds(string value)
        {
            var ids = WorkItemPattern.Matches(value)
                .Cast<Match>()
                .Concat(WorkItemUrlPattern.Matches(value).Cast<Match>())
                .Concat(LeadingWorkItemPattern
                    .Matches(BreakPattern.Replace(CleanCell(value), "\n"))
                    .Cast<Match>())
                .Select(match => int.Parse(match.Groups["id"].Value))
                .Distinct()
                .ToArray();
            return ids;
        }

        private static IReadOnlyCollection<PlanningGoalDeliverable> ParseDeliverables(
            string value,
            DeveloperTeam team,
            int goalNumber)
            => ChecklistLines(value)
                .Select((line, index) =>
                {
                    var match = Regex.Match(
                        line,
                        @"^\s*-?\s*\[(?<checked>[xX ])\]\s*(?:P(?<priority>[1-4])\s*[-–—:]\s*)?(?<text>.+)$");
                    if (!match.Success)
                    {
                        return new PlanningGoalDeliverable(
                            $"wiki-{team.ToString().ToLowerInvariant()}-{goalNumber}-deliverable-{index + 1}",
                            line);
                    }

                    return new PlanningGoalDeliverable(
                        $"wiki-{team.ToString().ToLowerInvariant()}-{goalNumber}-deliverable-{index + 1}",
                        match.Groups["text"].Value.Trim(),
                        int.TryParse(match.Groups["priority"].Value, out var priority)
                            ? priority
                            : null,
                        string.Equals(
                            match.Groups["checked"].Value,
                            "x",
                            StringComparison.OrdinalIgnoreCase));
                })
                .ToArray();

        private static IReadOnlyCollection<PlanningGoalDoneCriterion>
            ParseDefinitionOfDone(
                string value,
                DeveloperTeam team,
                int goalNumber)
            => ChecklistLines(value)
                .Select((line, index) =>
                {
                    var match = Regex.Match(
                        line,
                        @"^\s*-?\s*\[(?<checked>[xX ])\]\s*(?<text>.+)$");
                    return new PlanningGoalDoneCriterion(
                        $"wiki-{team.ToString().ToLowerInvariant()}-{goalNumber}-dod-{index + 1}",
                        match.Success ? match.Groups["text"].Value.Trim() : line,
                        match.Success && string.Equals(
                            match.Groups["checked"].Value,
                            "x",
                            StringComparison.OrdinalIgnoreCase));
                })
                .ToArray();

        private static IEnumerable<string> ChecklistLines(string value)
            => CleanCell(value)
                .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(line => line.Length > 0);

        private static string NormalizeHeader(string value)
        {
            var normalized = Regex.Replace(
                CleanCell(value).ToLowerInvariant(),
                @"[^\p{L}\p{N}]",
                string.Empty);
            return normalized switch
            {
                "nr" or "nummer" => "nr",
                "epic" => "epic",
                "mal" or "mål" => "mål",
                var header when header.StartsWith("beskrivning", StringComparison.Ordinal)
                    => "beskrivning",
                var header when header.StartsWith("workitem", StringComparison.Ordinal)
                    => "workitem",
                var header when header.StartsWith("ansvarig", StringComparison.Ordinal) ||
                                header.EndsWith("ansvarig", StringComparison.Ordinal)
                    => "ansvarig",
                var header when header.StartsWith("sakkunnig", StringComparison.Ordinal) ||
                                header.StartsWith("internsakkunnig", StringComparison.Ordinal) ||
                                header.StartsWith("domanexpert", StringComparison.Ordinal) ||
                                header.StartsWith("domänexpert", StringComparison.Ordinal) ||
                                header.Contains("domanexpert", StringComparison.Ordinal) ||
                                header.Contains("domänexpert", StringComparison.Ordinal)
                    => "sakkunnig",
                // "Delleverans" is what the Syd table calls this column; "Leverabler" is the
                // heading the renderer below writes. Both mean the same thing, and only matching
                // one of them left the column silently unread.
                var header when header.StartsWith("leverabel", StringComparison.Ordinal) ||
                                header.StartsWith("delleverans", StringComparison.Ordinal) ||
                                header.StartsWith("leverans", StringComparison.Ordinal)
                    => "leverabler",
                var header when header.StartsWith("definitionofdone", StringComparison.Ordinal) ||
                                header == "dod"
                    => "definitionofdone",
                var header when header.StartsWith("delomrade", StringComparison.Ordinal) ||
                                header.StartsWith("delområde", StringComparison.Ordinal)
                    => "delområde",
                _ => normalized
            };
        }

        private static string RenderTeamSection(
            DeveloperTeam team,
            IEnumerable<PlanningSprintGoal> goals,
            int headingLevel,
            string newLine)
        {
            if (team == DeveloperTeam.Nord)
                return RenderNordTeamSection(goals, headingLevel, newLine);

            var builder = new StringBuilder();
            builder.Append(new string('#', headingLevel))
                .Append(TeamHeading(team))
                .Append(newLine)
                .Append("|  | **Mål** | **Ansvarig** | **Intern sakkunnig / domänexpert** | **Beskrivning** | **Leverabler** | **Definition of Done** | **Work Item** |")
                .Append(newLine)
                .Append("|--|--|--|--|--|--|--|--|")
                .Append(newLine);

            foreach (var goal in goals.OrderBy(goal => goal.Number))
            {
                var deliverables = string.Join(
                    "\n",
                    (goal.Deliverables ?? Array.Empty<PlanningGoalDeliverable>())
                    .Select(item =>
                        $"- [{(item.Done ? "x" : " ")}] " +
                        (item.Priority.HasValue ? $"P{item.Priority.Value} – " : string.Empty) +
                        item.Text));
                var definitionOfDone = string.Join(
                    "\n",
                    (goal.DefinitionOfDone ?? Array.Empty<PlanningGoalDoneCriterion>())
                    .Select(item => $"- [{(item.Checked ? "x" : " ")}] {item.Text}"));
                var workItems = string.Join(
                    " ",
                    (goal.WorkItemIds ?? Array.Empty<int>())
                    .Where(id => id > 0)
                    .Distinct()
                    .Select(id => $"#{id}"));

                builder.Append("| ")
                    .Append(goal.Number)
                    .Append(". | ")
                    .Append(MarkdownCell(goal.Title))
                    .Append(" | ")
                    .Append(MarkdownCell(string.Join(" / ", goal.Owners ?? Array.Empty<string>())))
                    .Append(" | ")
                    .Append(MarkdownCell(goal.Expert))
                    .Append(" | ")
                    .Append(MarkdownCell(goal.Description))
                    .Append(" | ")
                    .Append(MarkdownCell(deliverables))
                    .Append(" | ")
                    .Append(MarkdownCell(definitionOfDone))
                    .Append(" | ")
                    .Append(workItems)
                    .Append(" |")
                    .Append(newLine);
            }

            return builder.ToString().TrimEnd('\r', '\n');
        }

        private static string RenderNordTeamSection(
            IEnumerable<PlanningSprintGoal> goals,
            int headingLevel,
            string newLine)
        {
            var builder = new StringBuilder();
            builder.Append(new string('#', headingLevel))
                .Append(TeamHeading(DeveloperTeam.Nord))
                .Append(newLine)
                .Append("Prioritet av listade mål:")
                .Append(newLine)
                .Append("🔴 **P1** – Hög")
                .Append(newLine)
                .Append("🔵 **P2** – Standard  ")
                .Append(newLine)
                .Append("🟡 **P3** – Lägre  ")
                .Append(newLine)
                .Append("🟢 **P4** – Lägst")
                .Append(newLine)
                .Append(newLine)
                .Append("<table>")
                .Append(newLine)
                .Append(" <thead>")
                .Append(newLine)
                .Append("  <tr>")
                .Append(newLine)
                .Append("   <th>Nr</th>")
                .Append(newLine)
                .Append("   <th>Epic</th>")
                .Append(newLine)
                .Append("   <th>Mål</th>")
                .Append(newLine)
                .Append("   <th>Beskrivning</th>")
                .Append(newLine)
                .Append("   <th>Work Item</th>")
                .Append(newLine)
                .Append("  </tr>")
                .Append(newLine)
                .Append(" </thead>")
                .Append(newLine)
                .Append(" <tbody>")
                .Append(newLine);

            foreach (var goal in goals.OrderBy(goal => goal.Number))
            {
                var subGoals = NordSubGoalsForRendering(goal);
                for (var index = 0; index < subGoals.Count; index++)
                {
                    var subGoal = subGoals[index];
                    builder.Append("  <tr>").Append(newLine);
                    if (index == 0)
                    {
                        builder.Append("   <td rowspan=")
                            .Append(subGoals.Count)
                            .Append("><strong>")
                            .Append(goal.Number)
                            .Append(".</strong></td>")
                            .Append(newLine)
                            .Append("   <td rowspan=")
                            .Append(subGoals.Count)
                            .Append("><strong>")
                            .Append(HtmlCell(goal.Title))
                            .Append("</strong>");
                        if (!string.IsNullOrWhiteSpace(goal.Description))
                            builder.Append("<br>").Append(HtmlCell(goal.Description));
                        builder.Append("</td>").Append(newLine);
                    }

                    var priorityPrefix = subGoal.Priority is >= 1 and <= 4
                        ? $"{PriorityEmoji(subGoal.Priority.Value)} P{subGoal.Priority.Value} – "
                        : string.Empty;
                    builder.Append("   <td")
                        .Append(subGoal.Priority is >= 1 and <= 4
                            ? $" data-priority=\"P{subGoal.Priority.Value}\""
                            : string.Empty)
                        .Append("><strong>")
                        .Append(priorityPrefix)
                        .Append(HtmlCell(subGoal.Title))
                        .Append("</strong></td>")
                        .Append(newLine)
                        .Append("   <td>")
                        .Append(HtmlCell(subGoal.Description))
                        .Append("</td>")
                        .Append(newLine)
                        .Append("   <td>")
                        .Append(string.Join(
                            " <br> ",
                            (subGoal.WorkItemIds ?? Array.Empty<int>())
                            .Where(id => id > 0)
                            .Distinct()
                            .Select(id => $"#{id}")))
                        .Append("</td>")
                        .Append(newLine)
                        .Append("  </tr>")
                        .Append(newLine);
                }
            }

            return builder.Append(" </tbody>")
                .Append(newLine)
                .Append("</table>")
                .ToString()
                .TrimEnd('\r', '\n');
        }

        private static IReadOnlyList<PlanningSprintSubGoal> NordSubGoalsForRendering(
            PlanningSprintGoal goal)
        {
            var subGoals = (goal.SubGoals ?? Array.Empty<PlanningSprintSubGoal>())
                .Where(item => !string.IsNullOrWhiteSpace(item.Title))
                .ToList();
            if (subGoals.Count == 0)
            {
                subGoals.Add(new PlanningSprintSubGoal(
                    $"{goal.Id}-subgoal-1",
                    goal.Title,
                    WorkItemIds: goal.WorkItemIds));
                return subGoals;
            }

            var assigned = subGoals
                .SelectMany(item => item.WorkItemIds ?? Array.Empty<int>())
                .ToHashSet();
            var unassigned = (goal.WorkItemIds ?? Array.Empty<int>())
                .Where(id => id > 0 && !assigned.Contains(id))
                .ToArray();
            if (unassigned.Length > 0)
            {
                var first = subGoals[0];
                subGoals[0] = first with
                {
                    WorkItemIds = (first.WorkItemIds ?? Array.Empty<int>())
                        .Concat(unassigned)
                        .Distinct()
                        .ToArray()
                };
            }

            return subGoals;
        }

        private static string PriorityEmoji(int priority)
            => priority switch
            {
                1 => "🔴",
                2 => "🔵",
                3 => "🟡",
                4 => "🟢",
                _ => string.Empty
            };

        private static string HtmlCell(string? value)
            => string.Join(
                "<br>",
                NormalizeNewLines(value ?? string.Empty)
                    .Split('\n')
                    .Select(line => WebUtility.HtmlEncode(line.Trim())));

        private static string MarkdownCell(string? value)
            => string.Join(
                "<br>",
                NormalizeNewLines(value ?? string.Empty)
                    .Split('\n')
                    .Select(line => line.Trim()
                        .Replace("&", "&amp;", StringComparison.Ordinal)
                        .Replace("<", "&lt;", StringComparison.Ordinal)
                        .Replace(">", "&gt;", StringComparison.Ordinal)
                        .Replace("|", "\\|", StringComparison.Ordinal)));

        private static string TeamHeading(DeveloperTeam team)
            => team switch
            {
                DeveloperTeam.Nord => "myCarta",
                DeveloperTeam.Syd => "Energi- och VA-banken & GO-appar",
                _ => throw new ArgumentOutOfRangeException(
                    nameof(team),
                    team,
                    "Sprintmål kan endast hanteras för Team Nord eller Team Syd.")
            };

        private static IReadOnlyCollection<string> TeamHeadings(DeveloperTeam team)
            => team switch
            {
                DeveloperTeam.Nord => new[] { "myCarta" },
                DeveloperTeam.Syd => new[]
                {
                    "Energi- och VA-banken & GO-appar",
                    "Energi- och VA-banken/GO-appar"
                },
                _ => throw new ArgumentOutOfRangeException(nameof(team), team, null)
            };

        private static string CleanCell(string value)
        {
            var cleaned = BreakPattern.Replace(value ?? string.Empty, "\n");
            cleaned = LinkPattern.Replace(cleaned, match => match.Groups["label"].Value);
            cleaned = HtmlTagPattern.Replace(cleaned, string.Empty);
            cleaned = WebUtility.HtmlDecode(cleaned);
            cleaned = cleaned
                .Replace('\u00a0', ' ')
                .Replace("**", string.Empty)
                .Replace("__", string.Empty)
                .Replace("*", string.Empty)
                .Replace("_", string.Empty)
                .Replace("\\|", "|");

            return string.Join(
                "\n",
                NormalizeNewLines(cleaned)
                    .Split('\n')
                    .Select(line => Regex.Replace(line, @"[ \t]+", " ").Trim())
                    .Where(line => line.Length > 0));
        }

        private static string NormalizeNewLines(string value)
            => value.Replace("\r\n", "\n").Replace('\r', '\n');

        private sealed record ParsedHtmlCell(
            string Tag,
            string Attributes,
            string Content);

        private sealed class NordGoalBuilder
        {
            public NordGoalBuilder(
                int number,
                string title,
                string description,
                int ordinal)
            {
                Number = number;
                Title = title;
                Description = description;
                Ordinal = ordinal;
            }

            public int Number { get; }
            public string Title { get; }
            public string Description { get; }
            public int Ordinal { get; }
            public List<PlanningSprintSubGoal> SubGoals { get; } = new();

            public PlanningSprintGoal ToGoal()
                => new(
                    $"wiki-nord-{Number}-{Ordinal}",
                    Number,
                    Title,
                    Description,
                    WorkItemIds: SubGoals
                        .SelectMany(item => item.WorkItemIds ?? Array.Empty<int>())
                        .Distinct()
                        .ToArray(),
                    SubGoals: SubGoals.ToArray());
        }
    }
}
