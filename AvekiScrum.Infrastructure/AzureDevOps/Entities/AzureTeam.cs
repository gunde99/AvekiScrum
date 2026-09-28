using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public sealed class AzureTeamsResponse
    {
        [JsonPropertyName("value")]
        public List<AzureTeam> Value { get; set; } = new();
    }

    public sealed class AzureTeam
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }
}
