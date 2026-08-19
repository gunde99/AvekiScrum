using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class WorkItemRevision
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("rev")]
        public int Rev { get; set; }

        // Fälten kommer som ett namngivet JSON‐objekt där
        // nyckeln är fältnamnet och värdet oftast är string/int/double/date
        [JsonPropertyName("fields")]
        public Dictionary<string, JsonElement> Fields { get; set; }
    }

    public class WorkItemRevisionsResponse
    {
        [JsonPropertyName("value")]
        public List<WorkItemRevision> Value { get; set; }
    }
}
