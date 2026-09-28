using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public sealed class AzureBoardsResponse
    {
        [JsonPropertyName("value")]
        public List<AzureBoardReference> Value { get; set; } = new();
    }

    public sealed class AzureBoardReference
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }

    /// <summary>
    /// One team board's row/column configuration. <see cref="Rows"/> and <see cref="Columns"/> carry
    /// no explicit order field from Azure - the array position *is* the order.
    /// </summary>
    public sealed class AzureBoardDetail
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("rows")]
        public List<AzureBoardRow> Rows { get; set; } = new();

        [JsonPropertyName("columns")]
        public List<AzureBoardColumn> Columns { get; set; } = new();

        /// <summary>Which work item fields actually carry this board's column/lane - see the
        /// ExtensionData doc comment on WorkItemFields for why this can't be a fixed field name.</summary>
        [JsonPropertyName("fields")]
        public AzureBoardFields Fields { get; set; }
    }

    public sealed class AzureBoardFields
    {
        [JsonPropertyName("columnField")]
        public AzureBoardFieldRef ColumnField { get; set; }

        [JsonPropertyName("rowField")]
        public AzureBoardFieldRef RowField { get; set; }
    }

    public sealed class AzureBoardFieldRef
    {
        [JsonPropertyName("referenceName")]
        public string ReferenceName { get; set; }
    }

    public sealed class AzureBoardRow
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        /// <summary>Empty for the board's unnamed default row - mapped to "Standard" by
        /// GetProductBacklogAsync, matching the label Azure itself shows in the Boards UI.</summary>
        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("color")]
        public string Color { get; set; }
    }

    public sealed class AzureBoardColumn
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }
}
