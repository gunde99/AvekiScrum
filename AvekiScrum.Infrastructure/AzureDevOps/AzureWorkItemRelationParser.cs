using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Infrastructure.AzureDevOps.Entities;

namespace AvekiScrum.Infrastructure.AzureDevOps.Offline
{
    public static class AzureWorkItemRelationParser
    {
        private static readonly Regex _idAtEnd = new(@"\/(\d+)$", RegexOptions.Compiled);
        // Artifact URI prefixes (vanliga i Azure DevOps)
        private const string GitCommitPrefix = "vstfs:///Git/Commit/";
        private const string GitPullRequestPrefix = "vstfs:///Git/PullRequestId/";

        // -----------------------------
        // Parent/Child (hierarchy)
        // -----------------------------
        public static int? TryGetParentId(IReadOnlyList<WorkItemRelation> relations)
        {
            if (relations == null || relations.Count == 0) return null;

            var parent = relations.FirstOrDefault(r =>
                string.Equals(r.Rel, "System.LinkTypes.Hierarchy-Reverse", StringComparison.OrdinalIgnoreCase));

            return parent == null ? null : TryParseIdFromUrl(parent.Url);
        }

        public static List<int> GetChildIds(IReadOnlyList<WorkItemRelation> relations)
        {
            if (relations == null || relations.Count == 0) return new List<int>();

            return relations
                .Where(r => string.Equals(r.Rel, "System.LinkTypes.Hierarchy-Forward", StringComparison.OrdinalIgnoreCase))
                .Select(r => TryParseIdFromUrl(r.Url))
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToList();
        }

        public static int? TryParseIdFromUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return null;

            // url ser ofta ut som .../_apis/wit/workItems/12345
            var m = _idAtEnd.Match(url.Trim());
            if (!m.Success) return null;

            return int.TryParse(m.Groups[1].Value, out var id) ? id : null;
        }

        // -----------------------------
        // Git artifacts (PR + Commit)
        // -----------------------------
        public static List<PullRequestSimpleDto> GetPullRequests(IReadOnlyList<WorkItemRelation> relations)
        {
            if (relations == null || relations.Count == 0) return new();

            var list = new List<PullRequestSimpleDto>();

            foreach (var r in relations)
            {
                if (!IsArtifactLink(r)) continue;
                if (!TryParsePullRequestKey(r.Url, out var repoId, out var prId)) continue;

                var title =
                    Attr.GetString(r.Attributes, "title") ??
                    Attr.GetString(r.Attributes, "name") ??
                    Attr.GetString(r.Attributes, "displayName") ??
                    "";

                var status =
                    Attr.GetString(r.Attributes, "status") ??
                    Attr.GetString(r.Attributes, "state") ??
                    "";

                // Ibland finns "resourceLink" eller "url" eller "link"
                var webUrl =
                    Attr.GetString(r.Attributes, "resourceLink") ??
                    Attr.GetString(r.Attributes, "webUrl") ??
                    Attr.GetString(r.Attributes, "url") ??
                    Attr.GetString(r.Attributes, "link") ??
                    "";

                var created =
                    Attr.GetDateTime(r.Attributes, "creationDate") ??
                    Attr.GetDateTime(r.Attributes, "createdDate") ??
                    Attr.GetDateTime(r.Attributes, "resourceCreatedDate");

                list.Add(new PullRequestSimpleDto
                {
                    PullRequestId = prId,
                    RepoId = repoId,
                    Title = title,
                    Status = status,
                    WebUrl = webUrl,
                    CreatedDate = created
                });
            }

            // dedupe: samma PR kan länkas flera gånger
            return list
                .GroupBy(x => (x.RepoId, x.PullRequestId))
                .Select(g => g.First())
                .ToList();
        }

        public static List<CommitDto> GetCommits(IReadOnlyList<WorkItemRelation> relations)
        {
            if (relations == null || relations.Count == 0) return new();

            var list = new List<CommitDto>();

            foreach (var r in relations)
            {
                if (!IsArtifactLink(r)) continue;
                if (!TryParseCommitKey(r.Url, out var repoId, out var commitId)) continue;

                // “comment/message” kan ibland finnas i attributes
                var comment =
                    Attr.GetString(r.Attributes, "comment") ??
                    Attr.GetString(r.Attributes, "message") ??
                    Attr.GetString(r.Attributes, "name"); // ibland “name” ~= message/summary

                // URL: Ibland finns det web-url i attributes. Annars kan du åtminstone spara artifact-url.
                var url =
                    Attr.GetString(r.Attributes, "url") ??
                    Attr.GetString(r.Attributes, "resourceLink") ??
                    null;

                var remoteUrl =
                    Attr.GetString(r.Attributes, "remoteUrl") ??
                    Attr.GetString(r.Attributes, "webUrl") ??
                    null;

                // Datum: kan komma som "date"/"createdDate". Ibland kan author/committer finnas som objekt.
                var date =
                    Attr.GetDateTime(r.Attributes, "date") ??
                    Attr.GetDateTime(r.Attributes, "createdDate") ??
                    Attr.GetDateTime(r.Attributes, "resourceCreatedDate");

                var author = Attr.GetSignature(r.Attributes, "author");
                var committer = Attr.GetSignature(r.Attributes, "committer");

                // Om date inte var separat, försök ta från author.date/committer.date
                date ??= author?.WhenUtc ?? committer?.WhenUtc;

                list.Add(new CommitDto
                {
                    RepoId = repoId,
                    CommitId = commitId,
                    Comment = comment,
                    Url = url,
                    RemoteUrl = remoteUrl,
                    Date = date,
                    Author = author,
                    Committer = committer
                });
            }

            // dedupe: samma commit kan länkas flera gånger
            return list.DistinctBy(x => $"{x.RepoId:N}:{x.CommitId}", StringComparer.OrdinalIgnoreCase).ToList();
        }

        private static bool IsArtifactLink(WorkItemRelation r)
            => r != null && string.Equals(r.Rel, "ArtifactLink", StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// Parsar: vstfs:///Git/PullRequestId/{projectId}%2F{repoId}%2F{pullRequestId}
        /// Vi returnerar RepoId + PR-id (projectId behövs sällan i din VM).
        /// </summary>
        private static bool TryParsePullRequestKey(string? url, out Guid repoId, out int pullRequestId)
        {
            repoId = default;
            pullRequestId = default;

            if (string.IsNullOrWhiteSpace(url)) return false;
            if (!url.StartsWith(GitPullRequestPrefix, StringComparison.OrdinalIgnoreCase)) return false;

            var tail = url.Substring(GitPullRequestPrefix.Length);
            var decoded = Uri.UnescapeDataString(tail); // %2f => /
            var parts = decoded.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length != 3) return false;

            // parts[0] = projectId (GUID)
            // parts[1] = repoId (GUID)
            // parts[2] = prId (int)
            if (!Guid.TryParse(parts[1], out repoId)) return false;
            if (!int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out pullRequestId)) return false;

            return true;
        }

        /// <summary>
        /// Parsar: vstfs:///Git/Commit/{projectId}%2F{repoId}%2F{commitId}
        /// commitId kan vara SHA.
        /// </summary>
        private static bool TryParseCommitKey(string? url, out Guid repoId, out string commitId)
        {
            repoId = default;
            commitId = string.Empty;

            if (string.IsNullOrWhiteSpace(url)) return false;
            if (!url.StartsWith(GitCommitPrefix, StringComparison.OrdinalIgnoreCase)) return false;

            var tail = url.Substring(GitCommitPrefix.Length);
            var decoded = Uri.UnescapeDataString(tail);
            var parts = decoded.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length != 3) return false;

            if (!Guid.TryParse(parts[1], out repoId)) return false;

            commitId = parts[2].Trim();
            if (string.IsNullOrWhiteSpace(commitId)) return false;

            return true;
        }

        // -----------------------------
        // Attribute helpers
        // -----------------------------
        private static class Attr
        {
            public static string? GetString(IDictionary<string, object>? attrs, params string[] keys)
            {
                if (attrs == null || attrs.Count == 0) return null;

                foreach (var k in keys)
                {
                    if (!attrs.TryGetValue(k, out var v) || v == null)
                        continue;

                    var s = CoerceToString(v);
                    if (!string.IsNullOrWhiteSpace(s))
                        return s;
                }
                return null;
            }

            public static DateTime? GetDateTime(IDictionary<string, object>? attrs, params string[] keys)
            {
                if (attrs == null || attrs.Count == 0) return null;

                foreach (var k in keys)
                {
                    if (!attrs.TryGetValue(k, out var v) || v == null)
                        continue;

                    if (TryCoerceToDateTime(v, out var dt))
                        return dt;
                }

                return null;
            }

            public static SignatureDto? GetSignature(IDictionary<string, object>? attrs, string key)
            {
                if (attrs == null || attrs.Count == 0) return null;
                if (!attrs.TryGetValue(key, out var v) || v == null) return null;

                // author/committer kan vara JsonElement (object) eller dictionary
                if (v is JsonElement je)
                {
                    if (je.ValueKind != JsonValueKind.Object) return null;

                    var name = je.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var email = je.TryGetProperty("email", out var e) ? e.GetString() : null;
                    DateTime? date = null;

                    if (je.TryGetProperty("date", out var d))
                    {
                        if (d.ValueKind == JsonValueKind.String &&
                            DateTime.TryParse(d.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
                            date = parsed;
                    }

                    if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(email) && !date.HasValue)
                        return null;

                    return new SignatureDto
                    {
                        Name = name,
                        Email = email,
                        WhenUtc = date
                    };
                }

                // Om din JSON-deserialisering ger Dictionary<string, object>
                if (v is IDictionary<string, object> dict)
                {
                    var name = dict.TryGetValue("name", out var n) ? CoerceToString(n) : null;
                    var email = dict.TryGetValue("email", out var e) ? CoerceToString(e) : null;
                    DateTime? date = null;
                    if (dict.TryGetValue("date", out var d) && TryCoerceToDateTime(d, out var parsed))
                        date = parsed;

                    if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(email) && !date.HasValue)
                        return null;

                    return new SignatureDto { Name = name, Email = email, WhenUtc = date };
                }

                return null;
            }

            private static string? CoerceToString(object v)
            {
                return v switch
                {
                    string s => s,
                    JsonElement je when je.ValueKind == JsonValueKind.String => je.GetString(),
                    JsonElement je when je.ValueKind == JsonValueKind.Number => je.GetRawText(),
                    JsonElement je when je.ValueKind == JsonValueKind.True => "true",
                    JsonElement je when je.ValueKind == JsonValueKind.False => "false",
                    _ => v.ToString()
                };
            }

            private static bool TryCoerceToDateTime(object v, out DateTime dt)
            {
                dt = default;

                if (v is DateTime dtd)
                {
                    dt = dtd;
                    return true;
                }

                if (v is string s)
                {
                    return DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out dt)
                           || DateTime.TryParse(s, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out dt);
                }

                if (v is JsonElement je)
                {
                    if (je.ValueKind == JsonValueKind.String)
                    {
                        var js = je.GetString();
                        if (js != null &&
                            (DateTime.TryParse(js, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out dt) ||
                             DateTime.TryParse(js, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out dt)))
                            return true;
                    }
                }

                return false;
            }
        }
    }
}
