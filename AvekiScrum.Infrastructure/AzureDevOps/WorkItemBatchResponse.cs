using System.Collections.Generic;
using System.Text.Json.Serialization;
using AvekiScrum.Infrastructure.AzureDevOps.Entities;

namespace SprintDashboardApp.API
{
    public class WorkItemBatchResponse
    {
        [JsonPropertyName("value")]
        public List<WorkItemWithFields> Value { get; set; }
    }
}
