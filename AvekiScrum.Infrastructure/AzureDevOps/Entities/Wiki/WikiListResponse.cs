namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    using System.Text.Json.Serialization;
    using System.Collections.Generic;

    public class WikiListResponse
    {
        [JsonPropertyName("value")]
        public List<WikiRepositoryItem> Value { get; set; }

        [JsonPropertyName("count")]
        public int Count { get; set; }
    }
}
