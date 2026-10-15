using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace AvekiScrum.Application.Upgrade
{
    /// <summary>
    /// The downloadable upgrade document (spec §5): the selected wiki pages joined into one markdown
    /// file, each wrapped in HTML-comment markers that say which page it came from. The markers are
    /// invisible in any markdown preview but survive a round trip through a text editor, which is what
    /// lets an edited file be uploaded and split back into its pages.
    ///
    /// Principle: the file carries identities, the server carries the truth. The header names the
    /// checkout and the commit the file was made from; everything else (base, who, which branch) is
    /// looked up server-side.
    /// </summary>
    public static class UpgradeDocumentFormat
    {
        public const int FormatVersion = 1;
        private const string Prefix = "AVEKI-UPPGRADERING";

        private static readonly Regex HeaderRe = new($@"^<!--\s*{Prefix}:HUVUD\s+(?<attrs>.*?)\s*-->$", RegexOptions.Compiled);
        private static readonly Regex StartRe = new($@"^<!--\s*{Prefix}:SEKTION-START\s+id=(?<id>\S+)\s*-->$", RegexOptions.Compiled);
        private static readonly Regex EndRe = new($@"^<!--\s*{Prefix}:SEKTION-SLUT\s+id=(?<id>\S+)\s*-->$", RegexOptions.Compiled);
        private static readonly Regex DocEndRe = new($@"^<!--\s*{Prefix}:SLUT\s*-->$", RegexOptions.Compiled);
        private static readonly Regex AnyMarkerRe = new($@"^<!--\s*{Prefix}", RegexOptions.Compiled);
        private static readonly Regex AttrRe = new(@"(?<k>[\w-]+)=(?<v>\S+)", RegexOptions.Compiled);
        private static readonly Regex HeadingRe = new(@"^(?<hashes>#{1,6})(?<rest>\s.*|)$", RegexOptions.Compiled);
        private static readonly Regex FenceRe = new(@"^\s{0,3}(?<fence>`{3,}|~{3,})", RegexOptions.Compiled);

        public sealed record Section(string Id, string Release, string Title, string Content);

        public sealed record Document(
            string CheckoutId,
            string Commit,
            string Customer,
            string Product,
            IReadOnlyList<string> Releases,
            string CreatedBy,
            DateTimeOffset CreatedAt,
            IReadOnlyList<Section> Sections);

        public sealed record ParseResult(
            string? CheckoutId,
            string? Commit,
            IReadOnlyDictionary<string, string> Sections,
            IReadOnlyList<string> Errors,
            IReadOnlyList<string> Warnings)
        {
            public bool Ok => Errors.Count == 0;
        }

        /// <summary>LF line endings, no BOM, exactly one trailing newline - the form every comparison
        /// uses. Trailing spaces inside lines are kept: two of them are a markdown line break.</summary>
        public static string Normalize(string text)
        {
            var s = text.Replace("\r\n", "\n").Replace('\r', '\n');
            if (s.Length > 0 && s[0] == '﻿') s = s[1..];
            return s.TrimEnd('\n', ' ', '\t') + "\n";
        }

        public static string Compose(Document doc)
        {
            var multiRelease = doc.Releases.Count > 1;
            var titleLevel = multiRelease ? 3 : 2;
            var shift = titleLevel - 1; // page headings start at ##; they must end up below the page title
            var sb = new StringBuilder();

            sb.Append($"<!-- {Prefix}:HUVUD format={FormatVersion} utcheckning={doc.CheckoutId} commit={doc.Commit} skift={shift} -->\n");
            sb.Append("<!-- ⛔ RADER SOM BÖRJAR MED \"<!-- AVEKI\" FÅR INTE ÄNDRAS, FLYTTAS ELLER TAS BORT.\n");
            sb.Append("     Skriv fritt MELLAN markörerna. Text utanför markörerna förs inte tillbaka till wikin. -->\n\n");
            sb.Append($"# Uppgradering {doc.Customer} – {doc.Product} {string.Join(" → ", doc.Releases)}\n\n");
            sb.Append($"> Utcheckat från AvekiDokumentation (utcheckning {doc.CheckoutId}). Ändringar mellan markörerna kan laddas upp igen\n");
            sb.Append("> under AvekiDokumentation → Uppgradering. Dokumentet är gemensamt för alla kunder – skriv kundspecifika\n");
            sb.Append("> uppgifter (servernamn och liknande) i kundens eget dokument.\n\n");
            sb.Append($"Kund: {doc.Customer} · Utcheckat {doc.CreatedAt.ToLocalTime():yyyy-MM-dd} av {doc.CreatedBy}\n\n");

            string? currentRelease = null;
            foreach (var section in doc.Sections)
            {
                if (multiRelease && section.Release != currentRelease)
                {
                    currentRelease = section.Release;
                    sb.Append($"## Release {section.Release}\n\n");
                }
                sb.Append(new string('#', titleLevel)).Append(' ').Append(section.Title).Append("\n\n");
                sb.Append($"<!-- {Prefix}:SEKTION-START id={section.Id} -->\n");
                sb.Append(ShiftHeadings(Normalize(section.Content), shift));
                sb.Append($"<!-- {Prefix}:SEKTION-SLUT id={section.Id} -->\n\n");
            }
            sb.Append($"<!-- {Prefix}:SLUT -->\n");
            return sb.ToString();
        }

        public static ParseResult Parse(string text)
        {
            var errors = new List<string>();
            var warnings = new List<string>();
            var sections = new Dictionary<string, string>(StringComparer.Ordinal);
            string? checkoutId = null, commit = null;
            var shift = 1;

            var lines = Normalize(text).Split('\n');
            // Word and some editors turn "--" into an en/em dash and straight quotes into curly ones -
            // forgive that inside marker lines only, since that's the usual way a marker gets damaged.
            static string Clean(string line) => line.Trim().Replace('–', '-').Replace('—', '-').Replace("<!—", "<!--").Replace("—>", "-->");

            string? openId = null;
            var openLine = 0;
            var buffer = new List<string>();
            var outsideText = false;

            for (var i = 0; i < lines.Length; i++)
            {
                var raw = lines[i];
                var line = AnyMarkerRe.IsMatch(Clean(raw)) ? Clean(raw) : raw;
                var lineNo = i + 1;

                Match m;
                if ((m = HeaderRe.Match(line)).Success)
                {
                    var attrs = AttrRe.Matches(m.Groups["attrs"].Value).ToDictionary(a => a.Groups["k"].Value, a => a.Groups["v"].Value);
                    if (!attrs.TryGetValue("format", out var f) || f != FormatVersion.ToString())
                        errors.Add($"Rad {lineNo}: filformatet stöds inte (format={f ?? "saknas"}).");
                    attrs.TryGetValue("utcheckning", out checkoutId);
                    attrs.TryGetValue("commit", out commit);
                    if (attrs.TryGetValue("skift", out var s) && int.TryParse(s, out var parsed)) shift = parsed;
                    continue;
                }
                if ((m = StartRe.Match(line)).Success)
                {
                    if (openId is not null)
                        errors.Add($"Rad {lineNo}: ny sektion startar innan sektionen från rad {openLine} har avslutats.");
                    openId = m.Groups["id"].Value;
                    openLine = lineNo;
                    buffer.Clear();
                    continue;
                }
                if ((m = EndRe.Match(line)).Success)
                {
                    var id = m.Groups["id"].Value;
                    if (openId is null)
                        errors.Add($"Rad {lineNo}: sektionsslut utan start (id={id}).");
                    else if (id != openId)
                        errors.Add($"Rad {lineNo}: sektionsslut för {id}, men sektionen från rad {openLine} heter {openId}.");
                    else if (sections.ContainsKey(id))
                        errors.Add($"Rad {lineNo}: sektionen {id} förekommer två gånger.");
                    else
                        sections[id] = UnshiftHeadings(string.Join("\n", buffer).TrimEnd('\n') + "\n", shift);
                    openId = null;
                    continue;
                }
                if (DocEndRe.IsMatch(line)) continue;
                if (AnyMarkerRe.IsMatch(line))
                {
                    errors.Add($"Rad {lineNo}: okänd eller skadad markör: {raw.Trim()}");
                    continue;
                }

                if (openId is not null) buffer.Add(raw);
                else if (raw.Trim().Length > 0 && !IsGeneratedLine(raw)) outsideText = true;
            }

            if (openId is not null)
                errors.Add($"Rad {openLine}: sektionen {openId} avslutas aldrig.");
            if (checkoutId is null)
                errors.Add("Filen saknar huvudmarkören (första raden som börjar med <!-- AVEKI-UPPGRADERING:HUVUD). Är det rätt fil?");
            if (outsideText)
                warnings.Add("Det finns text utanför markörerna. Den förs inte tillbaka till wikin.");

            return new ParseResult(checkoutId, commit, sections, errors, warnings);
        }

        /// <summary>Lines Compose writes outside the sections - not counted as "text outside markers".</summary>
        private static bool IsGeneratedLine(string line)
        {
            var t = line.TrimStart();
            return t.StartsWith('#') || t.StartsWith('>') || t.StartsWith("<!--", StringComparison.Ordinal)
                || t.StartsWith("Kund:", StringComparison.Ordinal)
                || t.StartsWith("Skriv fritt MELLAN", StringComparison.Ordinal);
        }

        public static string ShiftHeadings(string markdown, int levels) => Reheading(markdown, levels);

        public static string UnshiftHeadings(string markdown, int levels) => Reheading(markdown, -levels);

        /// <summary>Moves every ATX heading by <paramref name="delta"/> levels (clamped to 1–6), leaving
        /// fenced code blocks alone - a "# comment" in a shell script is not a heading.</summary>
        private static string Reheading(string markdown, int delta)
        {
            if (delta == 0) return markdown;
            var lines = markdown.Split('\n');
            string? fence = null;
            for (var i = 0; i < lines.Length; i++)
            {
                var f = FenceRe.Match(lines[i]);
                if (f.Success)
                {
                    var marker = f.Groups["fence"].Value;
                    if (fence is null) fence = marker;
                    else if (marker[0] == fence[0] && marker.Length >= fence.Length) fence = null;
                    continue;
                }
                if (fence is not null) continue;
                var h = HeadingRe.Match(lines[i]);
                if (!h.Success) continue;
                var level = Math.Clamp(h.Groups["hashes"].Value.Length + delta, 1, 6);
                lines[i] = new string('#', level) + h.Groups["rest"].Value;
            }
            return string.Join("\n", lines);
        }
    }
}
