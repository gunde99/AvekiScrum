using System;
using System.Collections.Generic;
using System.Linq;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    /// <summary>
    /// Den stabila sidreferensen som kan plockas ut ur en vanlig
    /// Azure DevOps Wiki-URL från webbläsaren.
    /// </summary>
    public sealed record AzureDevOpsWikiPageReference(
        string Organization,
        string Project,
        string WikiIdentifier,
        int? PageId,
        string? PagePath,
        string OriginalUrl)
    {
        public static AzureDevOpsWikiPageReference Parse(
            string wikiUrl,
            string expectedOrganization)
        {
            if (!Uri.TryCreate(wikiUrl?.Trim(), UriKind.Absolute, out var uri) ||
                !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                throw new FormatException(
                    "Wiki-URL:en måste vara en absolut HTTPS-adress.");
            }

            var segments = uri.AbsolutePath
                .Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Select(Uri.UnescapeDataString)
                .ToArray();
            string organization;
            string[] projectSegments;

            if (string.Equals(uri.Host, "dev.azure.com", StringComparison.OrdinalIgnoreCase))
            {
                if (segments.Length < 2)
                    throw InvalidUrl();
                organization = segments[0];
                projectSegments = segments.Skip(1).ToArray();
            }
            else if (uri.Host.EndsWith(
                         ".visualstudio.com",
                         StringComparison.OrdinalIgnoreCase))
            {
                organization = uri.Host[..^".visualstudio.com".Length];
                projectSegments = segments;
            }
            else
            {
                throw new FormatException(
                    "Endast Wiki-adresser från dev.azure.com eller visualstudio.com stöds.");
            }

            if (!string.Equals(
                    organization,
                    expectedOrganization,
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new FormatException(
                    $"Wiki-adressen tillhör organisationen {organization}, inte {expectedOrganization}.");
            }

            var wikiIndex = Array.FindIndex(
                projectSegments,
                segment => string.Equals(segment, "_wiki", StringComparison.OrdinalIgnoreCase));
            if (wikiIndex < 1 ||
                wikiIndex + 2 >= projectSegments.Length ||
                !string.Equals(
                    projectSegments[wikiIndex + 1],
                    "wikis",
                    StringComparison.OrdinalIgnoreCase))
            {
                throw InvalidUrl();
            }

            var project = projectSegments[wikiIndex - 1];
            var wikiIdentifier = projectSegments[wikiIndex + 2];
            int? pageId = null;
            if (wikiIndex + 3 < projectSegments.Length &&
                int.TryParse(projectSegments[wikiIndex + 3], out var parsedPageId))
            {
                pageId = parsedPageId;
            }

            var query = ParseQuery(uri.Query);
            query.TryGetValue("pagePath", out var pagePath);
            if (!pageId.HasValue &&
                query.TryGetValue("pageId", out var pageIdValue) &&
                int.TryParse(pageIdValue, out parsedPageId))
            {
                pageId = parsedPageId;
            }

            if (!pageId.HasValue && string.IsNullOrWhiteSpace(pagePath))
            {
                throw new FormatException(
                    "Wiki-adressen saknar både sid-id och pagePath.");
            }

            return new AzureDevOpsWikiPageReference(
                organization,
                project,
                wikiIdentifier,
                pageId,
                string.IsNullOrWhiteSpace(pagePath) ? null : pagePath,
                uri.AbsoluteUri);
        }

        private static Dictionary<string, string> ParseQuery(string query)
        {
            var values = new Dictionary<string, string>(
                StringComparer.OrdinalIgnoreCase);
            foreach (var part in query.TrimStart('?')
                         .Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var pair = part.Split('=', 2);
                var name = Uri.UnescapeDataString(pair[0].Replace('+', ' '));
                var value = pair.Length > 1
                    ? Uri.UnescapeDataString(pair[1].Replace('+', ' '))
                    : string.Empty;
                values[name] = value;
            }

            return values;
        }

        private static FormatException InvalidUrl()
            => new(
                "Adressen känns inte igen som en Azure DevOps Wiki-sida. " +
                "Kopiera sidans URL från webbläsaren.");
    }
}
