using System;

namespace AvekiScrum.Application.Upgrade
{
    /// <summary>
    /// Azure DevOps wiki file-name encoding: a page titled "GO-appar - Installationstest" is stored as
    /// "GO%2Dappar-%2D-Installationstest.md" - spaces become '-', and a real '-' (plus a few reserved
    /// characters) is percent-encoded.
    /// </summary>
    public static class WikiPathCodec
    {
        public static string DecodeSegment(string segment)
        {
            var name = segment.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ? segment[..^3] : segment;
            return Uri.UnescapeDataString(name.Replace('-', ' '));
        }

        public static string EncodeSegment(string title)
        {
            var s = title.Replace("-", "%2D").Replace(' ', '-');
            foreach (var (ch, rep) in new[] { (":", "%3A"), ("<", "%3C"), (">", "%3E"), ("*", "%2A"), ("?", "%3F"), ("|", "%7C"), ("\"", "%22") })
                s = s.Replace(ch, rep);
            return s;
        }

        /// <summary>The last path segment, decoded to a title.</summary>
        public static string TitleOf(string gitPath) => DecodeSegment(gitPath[(gitPath.LastIndexOf('/') + 1)..]);
    }
}
