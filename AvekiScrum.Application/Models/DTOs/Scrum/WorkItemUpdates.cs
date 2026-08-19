using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Developer;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class WorkItemUpdatesRoot
    {
        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("value")]
        public List<WorkItemUpdate> Value { get; set; } = new();
    }

    public sealed class WorkItemUpdate
    {
        public int Id { get; set; }
        public int Rev { get; set; }
        public DateTimeOffset RevisedDate { get; set; }
        public WorkItemFieldsChange? Fields { get; set; }
    }

    public sealed class FieldChange<T> { public T? OldValue { get; set; } public T? NewValue { get; set; } }
    public sealed class WorkItemFieldsChange
    {
        [JsonPropertyName("System.ChangedDate")] public FieldChange<DateTimeOffset>? ChangedDate { get; set; }
        [JsonPropertyName("System.State")] public FieldChange<string>? State { get; set; }
        [JsonPropertyName("System.AssignedTo")] public FieldChange<IdentityRef>? AssignedTo { get; set; }
        [JsonPropertyName("System.Tags")] public FieldChange<string>? Tags { get; set; }
    }
}
