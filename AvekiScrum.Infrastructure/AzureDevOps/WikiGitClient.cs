using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Configuration;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    /// <summary>
    /// IWikiGitClient over the Azure DevOps Git REST API (7.1). Its own typed HttpClient rather than
    /// AzureDevOpsRestClient: the flow depends on reading specific status codes (a push rejected
    /// because the branch moved, a 404 for "no such file"), which that client folds into exceptions.
    /// The credential comes from AzureDevOpsAuthHandler like every other client, so commits carry the
    /// signed-in consultant's identity in Entra mode.
    /// </summary>
    internal sealed class WikiGitClient : IWikiGitClient
    {
        private const string ApiVersion = "7.1";
        private const string ZeroCommit = "0000000000000000000000000000000000000000";

        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

        private readonly HttpClient _http;
        private readonly string _repoBase;

        public WikiGitClient(HttpClient http, IOptions<AzureSettings> azure, IOptions<UpgradeDocumentationSettings> settings)
        {
            _http = http;
            var a = azure.Value;
            var s = settings.Value;
            _http.BaseAddress = new Uri(a.BaseUrl.TrimEnd('/') + "/");
            _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            _repoBase = $"{Uri.EscapeDataString(a.Organization)}/{Uri.EscapeDataString(s.Project)}/_apis/git/repositories/{Uri.EscapeDataString(s.Repository)}";
        }

        public async Task<string?> GetBranchHeadAsync(string branch, CancellationToken ct = default)
        {
            var node = await GetJsonAsync($"{_repoBase}/refs?filter={Uri.EscapeDataString("heads/" + branch)}&api-version={ApiVersion}", ct);
            // The filter is a prefix match - "heads/x" also returns "heads/x-2", so match exactly.
            return node?["value"]?.AsArray()
                .FirstOrDefault(r => (string?)r?["name"] == "refs/heads/" + branch)?["objectId"]?.GetValue<string>();
        }

        public async Task<IReadOnlyList<WikiGitItem>> ListTreeAsync(string path, WikiGitVersion version, CancellationToken ct = default)
        {
            var url = $"{_repoBase}/items?scopePath={Uri.EscapeDataString(path)}&recursionLevel=Full&{VersionQuery(version)}&api-version={ApiVersion}";
            var node = await GetJsonAsync(url, ct);
            if (node is null) return Array.Empty<WikiGitItem>();
            return node["value"]!.AsArray()
                .Select(i => new WikiGitItem(
                    (string)i!["path"]!,
                    (bool?)i["isFolder"] ?? false,
                    (string?)i["objectId"] ?? ""))
                .ToList();
        }

        public async Task<string?> GetFileTextAsync(string path, WikiGitVersion version, CancellationToken ct = default)
        {
            var bytes = await GetFileBytesAsync(path, version, ct);
            if (bytes is null) return null;
            var text = Encoding.UTF8.GetString(bytes.Value.Bytes);
            return text.Length > 0 && text[0] == '﻿' ? text[1..] : text;
        }

        public async Task<(byte[] Bytes, string ContentType)?> GetFileBytesAsync(string path, WikiGitVersion version, CancellationToken ct = default)
        {
            var url = $"{_repoBase}/items?path={Uri.EscapeDataString(path)}&{VersionQuery(version)}&download=false&api-version={ApiVersion}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Accept.Clear();
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));
            using var response = await _http.SendAsync(request, ct);
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            await EnsureSuccessAsync(response, ct);
            var bytes = await response.Content.ReadAsByteArrayAsync(ct);
            return (bytes, GuessContentType(path));
        }

        public async Task CreateBranchAsync(string branch, string fromCommit, CancellationToken ct = default)
        {
            var body = new[] { new { name = "refs/heads/" + branch, oldObjectId = ZeroCommit, newObjectId = fromCommit } };
            var node = await SendJsonAsync(HttpMethod.Post, $"{_repoBase}/refs?api-version={ApiVersion}", body, ct);
            var ok = node?["value"]?[0]?["success"]?.GetValue<bool>() ?? false;
            if (!ok) throw new InvalidOperationException($"Kunde inte skapa grenen {branch}: {node?.ToJsonString()}");
        }

        public async Task<bool> DeleteBranchAsync(string branch, CancellationToken ct = default)
        {
            var head = await GetBranchHeadAsync(branch, ct);
            if (head is null) return false;
            var body = new[] { new { name = "refs/heads/" + branch, oldObjectId = head, newObjectId = ZeroCommit } };
            await SendJsonAsync(HttpMethod.Post, $"{_repoBase}/refs?api-version={ApiVersion}", body, ct);
            return true;
        }

        public async Task<string?> PushAsync(string branch, string expectedHead, IReadOnlyList<WikiGitChange> changes, string comment, CancellationToken ct = default)
        {
            var body = new
            {
                refUpdates = new[] { new { name = "refs/heads/" + branch, oldObjectId = expectedHead } },
                commits = new[]
                {
                    new
                    {
                        comment,
                        changes = changes.Select(c => new Dictionary<string, object?>
                        {
                            ["changeType"] = c.Type.ToString().ToLowerInvariant(),
                            ["item"] = new { path = c.Path },
                            ["newContent"] = c.Type == WikiGitChangeType.Delete ? null : new { content = c.Content ?? "", contentType = "rawtext" },
                        }.Where(kv => kv.Value is not null).ToDictionary(kv => kv.Key, kv => kv.Value)).ToArray(),
                    },
                },
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_repoBase}/pushes?api-version={ApiVersion}")
            {
                Content = JsonContent(body),
            };
            using var response = await _http.SendAsync(request, ct);
            // The branch moved since expectedHead: Azure DevOps answers 409 (or 400 with a
            // "stale"/TF401028 message on some versions). Either way: not ours to overwrite.
            if (response.StatusCode == HttpStatusCode.Conflict) return null;
            if (response.StatusCode == HttpStatusCode.BadRequest)
            {
                var text = await response.Content.ReadAsStringAsync(ct);
                if (text.Contains("TF401028", StringComparison.Ordinal) || text.Contains("stale", StringComparison.OrdinalIgnoreCase)) return null;
                throw new InvalidOperationException($"Git-push avvisades: {text}");
            }
            await EnsureSuccessAsync(response, ct);
            var node = JsonNode.Parse(await response.Content.ReadAsStringAsync(ct));
            return (string?)node?["commits"]?[0]?["commitId"];
        }

        public async Task<int> CreatePullRequestAsync(string sourceBranch, string targetBranch, string title, string description, CancellationToken ct = default)
        {
            var body = new
            {
                sourceRefName = "refs/heads/" + sourceBranch,
                targetRefName = "refs/heads/" + targetBranch,
                title,
                description,
            };
            var node = await SendJsonAsync(HttpMethod.Post, $"{_repoBase}/pullrequests?api-version={ApiVersion}", body, ct);
            return node!["pullRequestId"]!.GetValue<int>();
        }

        public async Task<WikiPullRequest> WaitForMergeStatusAsync(int pullRequestId, CancellationToken ct = default)
        {
            WikiPullRequest pr = await GetPullRequestAsync(pullRequestId, ct);
            for (var i = 0; i < 20 && pr.Status == "active" && pr.MergeStatus is "queued" or "notSet" or ""; i++)
            {
                await Task.Delay(1000, ct);
                pr = await GetPullRequestAsync(pullRequestId, ct);
            }
            return pr;
        }

        public async Task<IReadOnlyList<WikiMergeConflict>> GetConflictsAsync(int pullRequestId, CancellationToken ct = default)
        {
            var prNode = await GetJsonAsync($"{_repoBase}/pullrequests/{pullRequestId}?api-version={ApiVersion}", ct);
            var source = (string?)prNode?["lastMergeSourceCommit"]?["commitId"];
            var target = (string?)prNode?["lastMergeTargetCommit"]?["commitId"];

            var node = await GetJsonAsync($"{_repoBase}/pullrequests/{pullRequestId}/conflicts?api-version={ApiVersion}", ct);
            if (node is null) return Array.Empty<WikiMergeConflict>();
            return node["value"]!.AsArray()
                .Where(c => (string?)c?["resolutionStatus"] is null or "unresolved")
                .Select(c => new WikiMergeConflict(
                    c!["conflictId"]!.GetValue<int>(),
                    (string?)c["conflictType"] ?? "",
                    (string?)c["conflictPath"] ?? "",
                    (string?)c["mergeBaseCommit"]?["commitId"],
                    (string?)c["mergeSourceCommit"]?["commitId"] ?? source,
                    (string?)c["mergeTargetCommit"]?["commitId"] ?? target))
                .ToList();
        }

        public async Task ResolveConflictAsync(int pullRequestId, int conflictId, string mergedContent, CancellationToken ct = default)
        {
            // userMergedContent is a byte[] on the server, so it travels base64-encoded - and the
            // status has to be set explicitly, or the resolution is stored but the conflict stays
            // open (both found the hard way in the Labday POC run).
            var body = new
            {
                conflictId,
                conflictType = "editEdit",
                resolutionStatus = "resolved",
                resolution = new
                {
                    mergeType = "userMerged",
                    userMergedContent = Convert.ToBase64String(Encoding.UTF8.GetBytes(mergedContent)),
                },
            };
            await SendJsonAsync(HttpMethod.Patch, $"{_repoBase}/pullrequests/{pullRequestId}/conflicts/{conflictId}?api-version={ApiVersion}", body, ct);
        }

        public async Task<string?> CompletePullRequestAsync(int pullRequestId, string commitMessage, CancellationToken ct = default)
        {
            var pr = await WaitForMergeStatusAsync(pullRequestId, ct);
            var prNode = await GetJsonAsync($"{_repoBase}/pullrequests/{pullRequestId}?api-version={ApiVersion}", ct);
            var body = new
            {
                status = "completed",
                lastMergeSourceCommit = new { commitId = (string?)prNode?["lastMergeSourceCommit"]?["commitId"] },
                completionOptions = new { mergeStrategy = "squash", deleteSourceBranch = true, mergeCommitMessage = commitMessage },
            };
            await SendJsonAsync(HttpMethod.Patch, $"{_repoBase}/pullrequests/{pullRequestId}?api-version={ApiVersion}", body, ct);

            for (var i = 0; i < 20; i++)
            {
                pr = await GetPullRequestAsync(pullRequestId, ct);
                if (pr.Status == "completed") return pr.MergeCommitId;
                if (pr.MergeStatus is "conflicts" or "failure" or "rejectedByPolicy") break;
                await Task.Delay(1000, ct);
            }
            throw new InvalidOperationException($"Sammanslagningen blev inte klar (status {pr.Status}, merge {pr.MergeStatus}).");
        }

        public async Task AbandonPullRequestAsync(int pullRequestId, CancellationToken ct = default)
        {
            await SendJsonAsync(HttpMethod.Patch, $"{_repoBase}/pullrequests/{pullRequestId}?api-version={ApiVersion}", new { status = "abandoned" }, ct);
        }

        private async Task<WikiPullRequest> GetPullRequestAsync(int id, CancellationToken ct)
        {
            var node = await GetJsonAsync($"{_repoBase}/pullrequests/{id}?api-version={ApiVersion}", ct)
                ?? throw new InvalidOperationException($"PR {id} finns inte.");
            return new WikiPullRequest(
                id,
                (string?)node["status"] ?? "",
                (string?)node["mergeStatus"] ?? "",
                (string?)node["lastMergeCommit"]?["commitId"]);
        }

        private static string VersionQuery(WikiGitVersion v) =>
            $"versionDescriptor.versionType={(v.IsCommit ? "commit" : "branch")}&versionDescriptor.version={Uri.EscapeDataString(v.Value)}";

        private async Task<JsonNode?> GetJsonAsync(string url, CancellationToken ct)
        {
            using var response = await _http.GetAsync(url, ct);
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            await EnsureSuccessAsync(response, ct);
            return JsonNode.Parse(await response.Content.ReadAsStringAsync(ct));
        }

        private async Task<JsonNode?> SendJsonAsync(HttpMethod method, string url, object body, CancellationToken ct)
        {
            using var request = new HttpRequestMessage(method, url) { Content = JsonContent(body) };
            using var response = await _http.SendAsync(request, ct);
            await EnsureSuccessAsync(response, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            return string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text);
        }

        private static StringContent JsonContent(object body) =>
            new(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");

        private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
        {
            if (response.IsSuccessStatusCode) return;
            var text = await response.Content.ReadAsStringAsync(ct);
            string message = text;
            try { message = (string?)JsonNode.Parse(text)?["message"] ?? text; } catch (JsonException) { }
            throw new InvalidOperationException($"Azure DevOps svarade {(int)response.StatusCode}: {message}");
        }

        private static string GuessContentType(string path) => System.IO.Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".webp" => "image/webp",
            ".md" or ".order" => "text/plain; charset=utf-8",
            _ => "application/octet-stream",
        };
    }
}
