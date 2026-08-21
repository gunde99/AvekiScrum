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
    /// <summary>Extra tags on top of the support tag - optional, rarely used.</summary>
    List<string>? Tags);

/// <summary>
/// Shared rules for the support bug flow: what a support-reported bug is tagged with, how its
/// stakeholders are written, and where in the flow a given Azure state puts it.
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

    /// <summary>
    /// Where a bug is in the support flow, derived from its Azure state. Support doesn't care
    /// about Azure's vocabulary - they care whether anyone has picked it up and whether it's fixed.
    /// </summary>
    public static (string Key, string Label, int Step) FlowStageFor(string? state, string? iterationPath, string projectName)
    {
        var normalized = (state ?? "").Trim();
        if (string.Equals(normalized, "Closed", StringComparison.OrdinalIgnoreCase))
            return ("klar", "Klar", 4);
        if (string.Equals(normalized, "Resolved", StringComparison.OrdinalIgnoreCase))
            return ("testas", "Löst – testas", 3);
        if (string.Equals(normalized, "Active", StringComparison.OrdinalIgnoreCase))
            return ("arbete", "Under arbete", 2);

        // Still New: planned means someone has moved it out of the raw backlog and into a sprint,
        // which is the first sign to a reporter that the bug has actually been picked up.
        var planned = !string.IsNullOrWhiteSpace(iterationPath)
                      && !string.Equals(iterationPath.Trim(), projectName, StringComparison.OrdinalIgnoreCase);
        return planned ? ("planerad", "Planerad i sprint", 1) : ("inkommen", "Inkommen", 0);
    }

    public const int FlowStepCount = 5;

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

    /// <summary>
    /// The reporter's name, read back out of a formatted stakeholder field. Used by the dashboard's
    /// "mina ärenden" filter - with no sign-in yet, the reporter line is the only record of who
    /// filed a bug (the PAT owner is what Azure's CreatedBy says on every one of them).
    /// </summary>
    public static string? ReporterFrom(IEnumerable<string> stakeholderEntries)
    {
        foreach (var entry in stakeholderEntries)
        {
            var text = StripHtml(entry);
            foreach (var line in text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var trimmed = line.Trim();
                if (!trimmed.StartsWith("Buggrapportör:", StringComparison.OrdinalIgnoreCase)) continue;
                var name = trimmed["Buggrapportör:".Length..].Trim();
                // Drop a trailing "(note)" so the filter matches on the plain name.
                var paren = name.IndexOf(" (", StringComparison.Ordinal);
                if (paren > 0) name = name[..paren];
                if (name.Length > 0) return name;
            }
        }
        return null;
    }

    /// <summary>Turns the html stakeholder field into plain lines, one per div/br.</summary>
    public static string StripHtml(string html)
    {
        if (string.IsNullOrEmpty(html)) return "";
        var withBreaks = html
            .Replace("</div>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br/>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br />", "\n", StringComparison.OrdinalIgnoreCase);
        var sb = new System.Text.StringBuilder(withBreaks.Length);
        var inTag = false;
        foreach (var c in withBreaks)
        {
            if (c == '<') inTag = true;
            else if (c == '>') inTag = false;
            else if (!inTag) sb.Append(c);
        }
        return System.Net.WebUtility.HtmlDecode(sb.ToString());
    }

    private static string Escape(string text) =>
        text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
}
