using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class WorkItemBatchResponse
    {
        [JsonPropertyName("value")]
        public List<WorkItemWithFields> Value { get; set; } = new();
    }
}
