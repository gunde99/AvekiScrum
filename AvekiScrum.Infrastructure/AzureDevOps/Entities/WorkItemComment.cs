using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class WorkItemCommentsResponse
    {
        [JsonPropertyName("comments")]
        public List<WorkItemCommentEntity> Comments { get; set; } = new();
    }

    public class WorkItemCommentEntity
    {
        [JsonPropertyName("text")]
        public string Text { get; set; }

        [JsonPropertyName("createdDate")]
        public DateTime? CreatedDate { get; set; }

        [JsonPropertyName("createdBy")]
        public IdentityRef CreatedBy { get; set; }
    }
}
