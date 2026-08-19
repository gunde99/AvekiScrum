namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    using System.Text.Json.Serialization;
    using System.Collections.Generic;

    public class WikiPagesResponse
    {
        [JsonPropertyName("value")]
        public List<WikiPage> Value { get; set; }

        [JsonPropertyName("count")]
        public int Count { get; set; }
    }
}
