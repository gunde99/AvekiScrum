using System.Text.Json;

namespace AvekiScrum.Api;

/// <summary>One card as it appears in the published review report.</summary>
internal sealed record ReviewReportCard(int Id, string Title, string State, double StoryPoints, string? Url);

/// <summary>The cards one developer is on the hook for within a section.</summary>
internal sealed record ReviewReportGroup(string Developer, List<ReviewReportCard> Cards);

/// <summary>One of the three review lanes, with its cards grouped by developer.</summary>
internal sealed record ReviewReportSection(string Key, string Title, string Icon, List<ReviewReportGroup> Groups);

internal sealed record ReviewReportRequest(
    string Team,
    string Sprint,
    string? SprintStart,
    string? SprintEnd,
    List<ReviewReportSection> Sections,
    /// <summary>True returns the card without posting it, so the layout can be checked first.</summary>
    bool DryRun);

/// <summary>
/// Turns the review board's three lanes into the Adaptive Card posted to Teams.
///
/// Deliberately sparse: whoever reads this in the channel wants to know what will be shown, who
/// is presenting, and nothing else. No story-point totals, no status breakdowns, no card counts
/// per lane - those belong on the board, not in a message people skim before a meeting.
/// </summary>
internal static class ReviewReport
{
    public static object BuildAdaptiveCard(ReviewReportRequest request)
    {
        var body = new List<object>
        {
            new
            {
                type = "TextBlock",
                text = "Sprintreview",
                size = "Large",
                weight = "Bolder",
                wrap = true,
            },
            new
            {
                type = "TextBlock",
                text = SubtitleFor(request),
                isSubtle = true,
                spacing = "None",
                wrap = true,
            },
        };

        foreach (var section in request.Sections)
        {
            // A lane nobody put anything in is left out entirely rather than printed as an empty
            // heading - the report should only say what is actually going to happen.
            if (section.Groups.Count == 0) continue;

            body.Add(new
            {
                type = "TextBlock",
                text = $"{section.Icon} {section.Title}",
                size = "Medium",
                weight = "Bolder",
                wrap = true,
                separator = true,
                spacing = "Medium",
            });

            foreach (var group in section.Groups)
            {
                body.Add(new
                {
                    type = "TextBlock",
                    text = group.Developer,
                    weight = "Bolder",
                    wrap = true,
                    spacing = "Small",
                });
                foreach (var item in group.Cards)
                {
                    // The id is a link when we have a URL, so anyone can open the card straight
                    // from the channel without hunting for it in Azure DevOps.
                    var idText = string.IsNullOrWhiteSpace(item.Url) ? $"#{item.Id}" : $"[#{item.Id}]({item.Url})";
                    body.Add(new
                    {
                        type = "TextBlock",
                        text = $"{idText} {Escape(item.Title)}",
                        wrap = true,
                        spacing = "None",
                    });
                }
            }
        }

        if (body.Count == 2)
        {
            body.Add(new
            {
                type = "TextBlock",
                text = "Inga kort är taggade för den här reviewen än.",
                wrap = true,
                isSubtle = true,
                spacing = "Medium",
            });
        }

        // A dictionary rather than an anonymous type: the schema key is literally "$schema", which
        // isn't a legal C# property name.
        var card = new Dictionary<string, object?>
        {
            ["type"] = "AdaptiveCard",
            ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
            ["version"] = "1.4",
            ["body"] = body,
        };

        // Teams' incoming-webhook shape: a message with the adaptive card as its only attachment.
        return new
        {
            type = "message",
            attachments = new[]
            {
                new
                {
                    contentType = "application/vnd.microsoft.card.adaptive",
                    contentUrl = (string?)null,
                    content = card,
                },
            },
        };
    }

    private static string SubtitleFor(ReviewReportRequest request)
    {
        var parts = new List<string> { $"Team {request.Team}", request.Sprint };
        if (!string.IsNullOrWhiteSpace(request.SprintStart) && !string.IsNullOrWhiteSpace(request.SprintEnd))
            parts.Add($"{request.SprintStart} – {request.SprintEnd}");
        return string.Join(" · ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
    }

    /// <summary>
    /// Adaptive Card TextBlocks render markdown, so a title containing *, _, # or [ would come out
    /// mangled. Escaped rather than stripped - a card title is the one thing that must read exactly
    /// as it does in Azure.
    /// </summary>
    private static string Escape(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var sb = new System.Text.StringBuilder(text.Length + 8);
        foreach (var c in text)
        {
            if (c is '*' or '_' or '#' or '[' or ']' or '`' or '\\') sb.Append('\\');
            sb.Append(c);
        }
        return sb.ToString();
    }

    /// <summary>The card as indented JSON, for the preview step and for troubleshooting.</summary>
    public static string ToJson(object payload) =>
        JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
}
