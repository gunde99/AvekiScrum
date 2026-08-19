using System;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    //public sealed class WorkItemBatchRequest
    //{
    //    [JsonPropertyName("ids")]
    //    public int[] Ids { get; set; } = Array.Empty<int>();

    //    [JsonPropertyName("fields")]
    //    public string[] Fields { get; set; } = Array.Empty<string>();

    //    // VIKTIGT: heter "$expand" i JSON
    //    [JsonPropertyName("$expand")]
    //    public string? Expand { get; set; } // sätt till "relations"
    //}

    public sealed class WorkItemBatchRequest
    {
        [JsonPropertyName("ids")]
        public int[] Ids { get; set; } = Array.Empty<int>();

        // OBS: om du kör relations och din server är kinkig:
        // sätt Fields = null så property inte skickas alls.
        [JsonPropertyName("fields")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string[]? Fields { get; set; }

        // OBS: måste heta "$expand" i JSON
        [JsonPropertyName("$expand")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Expand { get; set; } // "relations" | "none" | "all" etc.
    }
}
