using System.Linq;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    using System;
    using System.Text.Json.Serialization;
    using System.Collections.Generic;

    public class WikiPage
    {
        [JsonPropertyName("path")]
        public string Path { get; set; }

        [JsonPropertyName("order")]
        public int Order { get; set; }

        [JsonPropertyName("isParentPage")]
        public bool? IsParentPage { get; set; }

        [JsonPropertyName("gitItemPath")]
        public string GitItemPath { get; set; }

        [JsonPropertyName("subPages")]
        public List<WikiPage> SubPages { get; set; } = new();

        [JsonPropertyName("url")]
        public string Url { get; set; }

        [JsonPropertyName("remoteUrl")]
        public string RemoteUrl { get; set; }

        [JsonPropertyName("content")]
        public string Content { get; set; }
    }

    public static class WikiPageHelper
    {
        public static List<WikiPage> BuildTree(List<WikiPage> flatPages)
        {
            // Filter out invalid entries
            var validPages = flatPages.Where(p => !string.IsNullOrWhiteSpace(p.Path)).ToList();

            var pageLookup = validPages.ToDictionary(p => p.Path, p => p);

            foreach (var page in validPages)
            {
                var parentPath = GetParentPath(page.Path);
                if (parentPath != null && pageLookup.TryGetValue(parentPath, out var parent))
                {
                    parent.SubPages.Add(page);
                }
            }

            // Return root nodes
            return validPages
                .Where(p => GetParentPath(p.Path) == null)
                .ToList();
        }

        private static string GetParentPath(string path)
        {
            if (string.IsNullOrEmpty(path) || path == "/")
                return null;

            var trimmed = path.TrimEnd('/');
            var lastSlash = trimmed.LastIndexOf('/');
            return lastSlash <= 0 ? "/" : trimmed.Substring(0, lastSlash);
        }

        public static WikiPage FindPageByPath(WikiPage rootPage, string targetPath)
        {
            if (rootPage == null)
                return null;

            if (string.Equals(rootPage.Path, targetPath, StringComparison.OrdinalIgnoreCase))
                return rootPage;

            foreach (var child in rootPage.SubPages)
            {
                var result = FindPageByPath(child, targetPath);
                if (result != null)
                    return result;
            }

            return null;
        }
    }
}
