using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace AvekiScrum.Application.Helpers
{
    public static class PersonIdentityMatcher
    {
        private static readonly Regex EmailPattern = new(
            @"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}",
            RegexOptions.Compiled |
            RegexOptions.IgnoreCase |
            RegexOptions.CultureInvariant);

        private static readonly Regex TokenPattern = new(
            @"[\p{L}\p{Nd}]+",
            RegexOptions.Compiled);

        public static bool IsMatch(string? left, string? right)
        {
            var leftKeys = MatchKeys(left);
            if (leftKeys.Count == 0)
                return false;

            var rightKeys = MatchKeys(right);
            return rightKeys.Count > 0 && leftKeys.Overlaps(rightKeys);
        }

        /// <summary>
        /// A single grouping key for deduplicating a roster/participant list - two entries with the
        /// same key are the same person (e.g. an old and a new email after a domain change, since
        /// both share the same local-part: "dennis.bergstrom@invit.se" and
        /// "dennis.bergstrom@aveki.se" both key to "dennisbergstrom"). Unlike <see cref="IsMatch"/>
        /// (a pairwise predicate), this is meant for `GroupBy`/dedup, not for matching an assignee
        /// against a scope - it deliberately favours the email local-part over the display name so a
        /// roster entry with a blank/placeholder display name still groups correctly.
        /// </summary>
        public static string CanonicalKey(string? value)
        {
            var trimmed = (value ?? string.Empty).Trim().Trim('<', '>');

            var email = EmailPattern.Match(trimmed).Value;
            if (!string.IsNullOrWhiteSpace(email))
            {
                var localPartKey = Normalize(email.Split('@')[0]);
                if (localPartKey.Length >= 4)
                    return localPartKey;
            }

            var tokens = TokenPattern.Matches(trimmed)
                .Select(match => Normalize(match.Value))
                .Where(token => token.Length >= 2)
                .OrderBy(token => token, StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (tokens.Count > 0)
                return string.Concat(tokens);

            return Normalize(trimmed);
        }

        private static HashSet<string> MatchKeys(string? value)
        {
            var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(value))
                return keys;

            var trimmed = value.Trim().Trim('<', '>');
            AddKey(keys, trimmed);
            AddTokenKeys(keys, trimmed);

            var email = EmailPattern.Match(trimmed).Value;
            if (!string.IsNullOrWhiteSpace(email))
            {
                var localPart = email.Split('@')[0];
                AddKey(keys, email);
                AddKey(keys, localPart);
                AddTokenKeys(keys, localPart);
            }

            return keys;
        }

        private static void AddKey(HashSet<string> keys, string value)
        {
            var key = Normalize(value);
            if (key.Length >= 4)
                keys.Add(key);
        }

        private static void AddTokenKeys(HashSet<string> keys, string value)
        {
            var tokens = TokenPattern.Matches(value ?? string.Empty)
                .Select(match => Normalize(match.Value))
                .Where(token => token.Length >= 2)
                .ToList();
            if (tokens.Count < 2)
                return;

            AddKey(keys, string.Concat(tokens));
            AddKey(keys, string.Concat(tokens.OrderBy(token => token, StringComparer.OrdinalIgnoreCase)));
            AddKey(keys, tokens[0] + tokens[^1]);
        }

        private static string Normalize(string value)
        {
            var normalized = (value ?? string.Empty)
                .Trim()
                .Trim('<', '>')
                .Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder(normalized.Length);
            foreach (var character in normalized)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                    continue;
                if (char.IsLetterOrDigit(character))
                    builder.Append(char.ToLowerInvariant(character));
            }

            return builder.ToString();
        }
    }
}
