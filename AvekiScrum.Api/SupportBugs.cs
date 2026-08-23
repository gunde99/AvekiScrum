using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Api;

/// <summary>One person or organisation behind a reported bug, with what kind of party they are.</summary>
/// <param name="Category">Matches one of <see cref="SupportBugs.StakeholderCategories"/>.</param>
/// <param name="Name">The person, municipality or organisation.</param>
/// <param name="Note">Optional: a case number, a contact person, a date - whatever the support
/// person would otherwise have squeezed into the name.</param>
internal sealed record SupportStakeholder(string Category, string Name, string? Note);

internal sealed record CreateSupportBugRequest(
    string Title,
    /// <summary>The finished repro-steps text, composed by the client from the template's parts.</summary>
    string ReproSteps,
    string Severity,
    string Source,
    string? SystemInfo,
    List<SupportStakeholder> Stakeholders,
    string? AreaPath,
    /// <summary>Link to the Lime case. What marks a bug as support's, alongside the tag.</summary>
    string? ExternalLink,
    /// <summary>Extra tags on top of the support tag - optional, rarely used.</summary>
    List<string>? Tags,
    /// <summary>Where it should land. Empty means the backlog, which is where most bugs belong.</summary>
    string? IterationPath = null);

/// <summary>One choice in the form's iteration picker.</summary>
/// <param name="Kind">"backlog", "current" or "future" - what the client colours and orders by.</param>
internal sealed record SupportIterationOption(string Path, string Label, string Kind);

/// <summary>
/// Shared rules for the support bug flow: which bugs belong to support, how their stakeholders are
/// read and written, and where in the flow a given Azure state puts them.
/// </summary>
internal static class SupportBugs
{
    /// <summary>
    /// The categories a stakeholder can have. Kept here rather than in the client so the label
    /// written into Azure and the label offered in the form can't drift apart - the whole point of
    /// the picker is that every card ends up formatted the same way.
    /// </summary>
    public static readonly string[] StakeholderCategories =
    {
        "Buggrapportör",
        "Support",
        "Intern",
        "Kund",
    };

    /// <summary>
    /// Prefilled into System Info on a new bug. A starting point the reporter overwrites - the
    /// point is that the fields we always want answered are already listed, so nobody has to
    /// remember them. Override with Support:SystemInfoTemplate in appsettings.json.
    /// </summary>
    public const string DefaultSystemInfoTemplate =
        "Produkt/app: \n" +
        "Version: \n" +
        "Miljö (prod/test/kund): \n" +
        "Webbläsare/OS: \n" +
        "Inträffade: ";

    // ---------------------------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------------------------

    /// <summary>
    /// Where a bug is, in support's terms. The three that matter to a reporter are whether it is
    /// still sitting in the backlog, planned into a sprint, or actually being worked on - Azure's
    /// own vocabulary answers none of those on its own, because "New" covers the first two.
    /// </summary>
    public static (string Key, string Label) StatusFor(string? state, string? iterationPath)
    {
        var normalized = (state ?? "").Trim();
        if (string.Equals(normalized, "Closed", StringComparison.OrdinalIgnoreCase))
            return ("klar", "Klar");
        if (string.Equals(normalized, "Resolved", StringComparison.OrdinalIgnoreCase))
            return ("testas", "Löst – testas");
        if (string.Equals(normalized, "Active", StringComparison.OrdinalIgnoreCase))
            return ("arbete", "Under arbete");

        // Still New. An iteration path deeper than the project root means someone has planned it
        // into a sprint - that, not the state, is the first sign the bug has been picked up.
        return IsPlanned(iterationPath) ? ("planerad", "Inplanerad") : ("backlogg", "I backloggen");
    }

    /// <summary>
    /// True when the iteration is a real sprint rather than the project's root node. Compared by
    /// depth rather than against the project name: bugs carried over from before the project was
    /// renamed still sit under the old root ("Utveckling\v27.1\sp2"), and a name comparison would
    /// call every one of those unplanned.
    /// </summary>
    private static bool IsPlanned(string? iterationPath) =>
        !string.IsNullOrWhiteSpace(iterationPath)
        && iterationPath.Split('\\', StringSplitOptions.RemoveEmptyEntries).Length > 1;

    /// <summary>
    /// The release versions a bug is associated with. Written in two places by two habits - as a
    /// tag ("27.1") and as an iteration-path folder ("v27.1") - so both are read and merged.
    /// </summary>
    private static readonly Regex VersionPattern = new(@"^v?(\d{2}\.\d)$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static List<string> VersionsFor(string? iterationPath, IEnumerable<string>? tags)
    {
        var versions = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var segment in (iterationPath ?? "").Split('\\', StringSplitOptions.RemoveEmptyEntries))
        {
            var match = VersionPattern.Match(segment.Trim());
            if (match.Success) versions.Add(match.Groups[1].Value);
        }
        foreach (var tag in tags ?? Enumerable.Empty<string>())
        {
            var match = VersionPattern.Match(tag.Trim());
            if (match.Success) versions.Add(match.Groups[1].Value);
        }
        return versions.ToList();
    }

    // ---------------------------------------------------------------------------------------
    // Which half of support the signed-in person belongs to
    // ---------------------------------------------------------------------------------------

    /// <summary>
    /// "Nord" or "Syd" for whoever is signed in, read off the role groups they matched in
    /// TeamRoleConfig - every team-scoped group name ends with the team ("StakeholdersTeamSyd").
    ///
    /// Support staff sit in the Stakeholders groups, which is exactly what makes this work without
    /// a second roster to maintain. Null for anyone who isn't in the config at all; the form then
    /// falls back to the configured default rather than guessing.
    /// </summary>
    public static string? TeamFor(IEnumerable<string>? roleGroups)
    {
        // First match wins. A couple of people (the QA lead) are listed under both teams, and for
        // those the choice is arbitrary either way - the picker still lets them change it.
        foreach (var group in roleGroups ?? Enumerable.Empty<string>())
        {
            if (group.EndsWith("TeamNord", StringComparison.OrdinalIgnoreCase)) return "Nord";
            if (group.EndsWith("TeamSyd", StringComparison.OrdinalIgnoreCase)) return "Syd";
        }
        return null;
    }

    /// <summary>
    /// The area path a new bug should start on: the one configured for the reporter's team, if that
    /// path actually exists in this project.
    ///
    /// The existence check is what keeps the sandbox working - ScrumLab has none of the real
    /// products, and a preselected path Azure doesn't know would make every save fail with a 400.
    /// </summary>
    public static string ResolveDefaultAreaPath(
        string? team,
        IConfiguration configuration,
        string project,
        IReadOnlyList<string> areas)
    {
        var configured = string.IsNullOrWhiteSpace(team) ? null : configuration[$"Support:TeamAreaPaths:{team}"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            // Written in appsettings as the product name alone ("myCarta"); the project prefix is
            // implied, as it is everywhere else an area path is spelled out.
            var full = configured.Contains('\\') ? configured : $"{project}\\{configured}";
            if (areas.Any(area => string.Equals(area, full, StringComparison.OrdinalIgnoreCase)))
                return full;
        }

        var fallback = configuration["Support:DefaultAreaPath"];
        return string.IsNullOrWhiteSpace(fallback) ? project : fallback;
    }

    // ---------------------------------------------------------------------------------------
    // Where a new bug can be filed
    // ---------------------------------------------------------------------------------------

    /// <summary>
    /// The iteration choices the form offers: the backlog, the sprint running right now, and the
    /// sprints still to come in the current release.
    ///
    /// Past sprints are left out deliberately - a bug reported today can't have happened in a
    /// sprint that already closed, and the full iteration tree is a hundred entries deep.
    /// </summary>
    /// <param name="backlogPath">Where an unplanned bug goes - the project root, normally.</param>
    /// <param name="currentPathOverride">Testing:IterationPathOverride, when a sandbox project's
    /// sprint dates don't line up with today.</param>
    public static List<SupportIterationOption> BuildIterationOptions(
        IReadOnlyList<IterationNodeDto> nodes,
        string backlogPath,
        string? currentPathOverride,
        DateTime today)
    {
        var options = new List<SupportIterationOption>
        {
            new(backlogPath, "Produktbacklogg", "backlog"),
        };

        // Only leaves are sprints; the levels above them are release folders ("v27.1").
        var sprints = nodes.Where(node => !node.HasChildren).ToList();

        var current =
            (!string.IsNullOrWhiteSpace(currentPathOverride)
                ? sprints.FirstOrDefault(s => string.Equals(s.Path, currentPathOverride, StringComparison.OrdinalIgnoreCase))
                : null)
            ?? sprints.FirstOrDefault(s => s.StartDate?.Date <= today && today <= s.FinishDate?.Date);

        if (current is not null)
            options.Add(new SupportIterationOption(current.Path, $"Aktuell sprint – {current.Name}", "current"));

        // "The current release" is the folder the running sprint sits in, rather than a version
        // from config: the two disagree the moment a release slips, and the sprint is the one that
        // knows what the team is actually working towards.
        var releaseFolder = ParentPath(current?.Path);

        foreach (var sprint in sprints
            .Where(s => s.StartDate?.Date > today)
            .Where(s => releaseFolder is null
                        || string.Equals(ParentPath(s.Path), releaseFolder, StringComparison.OrdinalIgnoreCase))
            .OrderBy(s => s.StartDate))
        {
            if (options.Any(o => string.Equals(o.Path, sprint.Path, StringComparison.OrdinalIgnoreCase))) continue;
            options.Add(new SupportIterationOption(sprint.Path, sprint.Name, "future"));
        }

        return options;
    }

    private static string? ParentPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        var lastSeparator = path.LastIndexOf('\\');
        return lastSeparator <= 0 ? null : path[..lastSeparator];
    }

    // ---------------------------------------------------------------------------------------
    // Writing stakeholders
    // ---------------------------------------------------------------------------------------

    /// <summary>
    /// The stakeholder lines as they're written into Custom.Stakeholders. That field is html, and
    /// what's already in Azure is a pile of hand-written &lt;div&gt; lines in no particular format -
    /// this gives every card the support tool creates the same labelled shape instead.
    /// </summary>
    public static string FormatStakeholders(IEnumerable<SupportStakeholder> stakeholders)
    {
        var lines = stakeholders
            .Where(s => !string.IsNullOrWhiteSpace(s.Name))
            .Select(s =>
            {
                var suffix = string.IsNullOrWhiteSpace(s.Note) ? "" : $" ({Escape(s.Note!.Trim())})";
                return $"<div><b>{Escape(s.Category.Trim())}:</b> {Escape(s.Name.Trim())}{suffix}</div>";
            });
        return string.Concat(lines);
    }

    // ---------------------------------------------------------------------------------------
    // Reading stakeholders
    // ---------------------------------------------------------------------------------------

    /// <summary>A name found in a bug's stakeholder field, sorted into colleague or customer.</summary>
    /// <param name="Category">"Support" for a colleague, "Kund" for anyone else.</param>
    internal sealed record ParsedStakeholder(string Category, string Name);

    /// <summary>
    /// Everyone at the company, for telling colleagues apart from customers in the stakeholder
    /// field. Built once per request from the role config plus any extra names.
    /// </summary>
    internal sealed class CompanyDirectory
    {
        private readonly List<(string Display, string[] Words)> _people = new();
        private readonly Dictionary<string, string> _uniqueFirstNames = new(StringComparer.Ordinal);

        public CompanyDirectory(IEnumerable<string> displayNames)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var name in displayNames)
            {
                var trimmed = (name ?? "").Trim();
                if (trimmed.Length == 0 || !seen.Add(trimmed)) continue;
                var words = Normalize(trimmed).Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (words.Length == 0) continue;
                _people.Add((trimmed, words));
            }

            // A bare first name only counts as a match when exactly one colleague has it. The real
            // data is full of lines like "Trollhättan via Emma", and guessing between two Emmas
            // would put the wrong colleague on the card.
            foreach (var group in _people.GroupBy(p => p.Words[0], StringComparer.Ordinal))
            {
                if (group.Count() == 1) _uniqueFirstNames[group.Key] = group.Single().Display;
            }
        }

        public int Count => _people.Count;

        /// <summary>
        /// The colleagues named somewhere in <paramref name="line"/>, and what is left of the line
        /// once their names are removed.
        /// </summary>
        public (List<string> Colleagues, string Remainder) Match(string line)
        {
            var words = Normalize(line).Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
            var originalWords = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries).ToList();
            var colleagues = new List<string>();
            var used = new bool[words.Count];

            // Full names first: "Sofie Backö" should be consumed as one person before the bare
            // first name "Sofie" gets a chance to match a different colleague.
            foreach (var (display, nameWords) in _people.OrderByDescending(p => p.Words.Length))
            {
                if (nameWords.Length < 2) continue;
                var positions = FindAll(words, used, nameWords);
                if (positions.Count == 0) continue;
                colleagues.Add(display);
                foreach (var index in positions) used[index] = true;
            }

            // Then the same names with a middle name in between: colleagues are spelled with the
            // full name on a card ("Alva Widerberg Palmfeldt") more often than the email their
            // roster entry was derived from suggests ("alva.palmfeldt@"). One extra word is
            // allowed inside the span, and the whole span is consumed - otherwise the middle name
            // would be left behind and read as a customer.
            foreach (var (display, nameWords) in _people)
            {
                if (nameWords.Length < 2 || colleagues.Contains(display)) continue;
                var span = FindSpan(words, used, nameWords, maxExtraWords: 1);
                if (span is null) continue;
                colleagues.Add(display);
                for (var index = span.Value.Start; index <= span.Value.End; index++) used[index] = true;
            }

            // A bare first name is only trusted where it can't be part of someone else's full
            // name: alone on its line, or introduced by a connector ("Trollhättan via Emma").
            // Without that guard "Dala Vatten, Fredrik Knapp" turns into a colleague named Fredrik
            // plus a customer called "Dala Vatten, Knapp".
            var meaningfulWords = words.Where((w, i) => !used[i] && !IsGlueWord(w)).Count();
            for (var i = 0; i < words.Count; i++)
            {
                if (used[i]) continue;
                if (!_uniqueFirstNames.TryGetValue(words[i], out var display)) continue;
                var introduced = i > 0 && IsGlueWord(words[i - 1]);
                if (!introduced && meaningfulWords > 1) continue;
                if (!colleagues.Contains(display)) colleagues.Add(display);
                used[i] = true;
            }

            // Rebuild the leftovers from the original (un-normalised) words so a customer keeps
            // their real spelling - "Lidköping", not "lidkoping".
            var remainder = string.Join(" ", originalWords.Where((_, i) => i < used.Length && !used[i]));
            return (colleagues, CleanRemainder(remainder));
        }

        /// <summary>
        /// The stretch of words containing all of <paramref name="nameWords"/> in order, with at
        /// most <paramref name="maxExtraWords"/> unrelated words mixed in - or null if the name
        /// isn't there at all.
        /// </summary>
        private static (int Start, int End)? FindSpan(List<string> words, bool[] used, string[] nameWords, int maxExtraWords)
        {
            for (var start = 0; start < words.Count; start++)
            {
                if (used[start] || words[start] != nameWords[0]) continue;
                var matched = 1;
                var end = start;
                for (var i = start + 1; i < words.Count && matched < nameWords.Length; i++)
                {
                    if (used[i]) break;
                    if (words[i] != nameWords[matched]) continue;
                    matched++;
                    end = i;
                }
                if (matched < nameWords.Length) continue;
                var extra = (end - start + 1) - nameWords.Length;
                if (extra <= maxExtraWords) return (start, end);
            }
            return null;
        }

        /// <summary>Every index where the consecutive run <paramref name="nameWords"/> occurs.</summary>
        private static List<int> FindAll(List<string> words, bool[] used, string[] nameWords)
        {
            var hits = new List<int>();
            for (var start = 0; start + nameWords.Length <= words.Count; start++)
            {
                var match = true;
                for (var offset = 0; offset < nameWords.Length; offset++)
                {
                    if (used[start + offset] || words[start + offset] != nameWords[offset])
                    {
                        match = false;
                        break;
                    }
                }
                if (!match) continue;
                for (var offset = 0; offset < nameWords.Length; offset++) hits.Add(start + offset);
                start += nameWords.Length - 1;
            }
            return hits;
        }
    }

    /// <summary>
    /// Words that only made sense as glue around a name. Left behind after a colleague is removed
    /// from a line ("Trollhättan via Emma" → "Trollhättan via"), they'd otherwise end up as part
    /// of the customer's name.
    /// </summary>
    private static readonly string[] GlueWords = { "via", "hos", "från", "fran", "till", "och", "genom", "genom:", "av" };

    private static string CleanRemainder(string remainder)
    {
        var words = remainder.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
        while (words.Count > 0 && IsGlueWord(words[^1])) words.RemoveAt(words.Count - 1);
        while (words.Count > 0 && IsGlueWord(words[0])) words.RemoveAt(0);
        var text = string.Join(" ", words).Trim(' ', ',', ';', '-', '–', '/', '.', ':');
        // A leftover with no letters at all is punctuation, not a customer.
        return text.Any(char.IsLetter) ? text : "";
    }

    /// <summary>True for a word that only ever joins a name to something else.</summary>
    private static bool IsGlueWord(string word) =>
        GlueWords.Contains(Normalize(word).Trim(' ', ',', ';', '-', '–', '/', '.', ':'));

    /// <summary>
    /// Reads the free-text stakeholder field and sorts every name in it into colleague ("Support")
    /// or customer ("Kund"). The field is the wild west - `&lt;div&gt;`s, `&lt;br&gt;`s, pasted Word
    /// markup, commas, case numbers - so this is best-effort by design: names we recognise become
    /// colleagues, and whatever is left over on a line is treated as the customer it almost always
    /// is.
    /// </summary>
    public static List<ParsedStakeholder> ParseStakeholders(string? rawHtml, CompanyDirectory directory)
    {
        var result = new List<ParsedStakeholder>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        {
            foreach (var rawLine in StripHtml(rawHtml ?? "").Split('\n'))
            {
                var line = rawLine.Trim();
                if (line.Length == 0) continue;

                // Our own cards are already labelled - take them at their word rather than
                // guessing at a line we wrote ourselves.
                var labelled = TryReadLabelledLine(line);
                if (labelled is not null)
                {
                    Add(labelled.Value.Category, labelled.Value.Name);
                    continue;
                }

                var (colleagues, remainder) = directory.Match(line);
                foreach (var colleague in colleagues) Add("Support", colleague);
                if (remainder.Length > 0) Add("Kund", remainder);
            }
        }

        return result;

        void Add(string category, string name)
        {
            var trimmed = name.Trim();
            if (trimmed.Length == 0) return;
            if (!seen.Add($"{category}|{trimmed}")) return;
            result.Add(new ParsedStakeholder(category, trimmed));
        }
    }

    /// <summary>A line this tool wrote itself: "Kategori: Namn (notering)".</summary>
    private static (string Category, string Name)? TryReadLabelledLine(string line)
    {
        var colon = line.IndexOf(':');
        if (colon <= 0) return null;
        var label = line[..colon].Trim();
        if (!StakeholderCategories.Contains(label, StringComparer.OrdinalIgnoreCase)) return null;
        var name = line[(colon + 1)..].Trim();
        return name.Length == 0 ? null : (label, name);
    }

    /// <summary>
    /// Who filed the bug. Our own cards say so outright on the Buggrapportör line; everything
    /// else falls back to who created it in Azure, which for a hand-written bug is the support
    /// person themselves. (Cards this tool creates all say the PAT owner, hence the order.)
    /// </summary>
    public static string? ReporterFrom(string? rawHtml, string? createdBy)
    {
        {
            foreach (var rawLine in StripHtml(rawHtml ?? "").Split('\n'))
            {
                var line = rawLine.Trim();
                if (!line.StartsWith("Buggrapportör:", StringComparison.OrdinalIgnoreCase)) continue;
                var name = line["Buggrapportör:".Length..].Trim();
                var paren = name.IndexOf(" (", StringComparison.Ordinal);
                if (paren > 0) name = name[..paren];
                if (name.Length > 0) return name;
            }
        }
        return string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim();
    }

    /// <summary>Turns the html stakeholder field into plain lines, one per div/br.</summary>
    public static string StripHtml(string html)
    {
        if (string.IsNullOrEmpty(html)) return "";
        var withBreaks = html
            .Replace("</div>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("</p>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br/>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br />", "\n", StringComparison.OrdinalIgnoreCase);
        var sb = new StringBuilder(withBreaks.Length);
        var inTag = false;
        foreach (var c in withBreaks)
        {
            if (c == '<') inTag = true;
            else if (c == '>') inTag = false;
            else if (!inTag) sb.Append(c);
        }
        // Non-breaking spaces come along with anything pasted from Word or Outlook.
        return System.Net.WebUtility.HtmlDecode(sb.ToString()).Replace(' ', ' ');
    }

    /// <summary>Lowercased and stripped of diacritics, so "Backö" matches "backo".</summary>
    private static string Normalize(string text)
    {
        var decomposed = text.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(char.IsLetterOrDigit(c) ? c : ' ');
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    private static string Escape(string text) =>
        text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
}
