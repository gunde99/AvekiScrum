using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class AzureTeamDto
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
    }

    /// <summary>A swimlane on the "Features" board - "Måste"/"Bör"/"Önskvärt"/... - ordered with the
    /// known priority lanes first, then whatever else the board defines, per
    /// AzureDevOpsBoardsClient.GetProductBacklogAsync.</summary>
    public sealed class ProductBacklogRowDto
    {
        public string Name { get; set; } = "";
        public string? Color { get; set; }
        public int Order { get; set; }
    }

    /// <summary>A board column. Icebox and Closed are rendered as their own top-level sections
    /// rather than as columns within every row - see the Refinement board's section grouping.</summary>
    public sealed class ProductBacklogColumnDto
    {
        public string Name { get; set; } = "";
        public string Kind { get; set; } = "lane"; // icebox | lane | closed
        public int Order { get; set; }
    }

    public sealed class ProductBacklogBoardDto
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Team { get; set; } = "";
        public List<ProductBacklogRowDto> Rows { get; set; } = new();
        public List<ProductBacklogColumnDto> Columns { get; set; } = new();
    }

    /// <summary>
    /// One Feature/Epic/User Story/Bug in the Refinement view. The board-specific fields
    /// (<see cref="BoardLane"/>, <see cref="BoardColumn"/>, <see cref="StackRank"/>) are only set on
    /// a Feature fetched through the product-backlog board; every other item (its Epic chain above,
    /// its User Stories/Bugs below) carries the rest so the hierarchy can render with real detail
    /// instead of a bare title.
    /// </summary>
    public sealed class ProductBacklogItemDto
    {
        public int Id { get; set; }
        public string Type { get; set; } = "";
        public string Title { get; set; } = "";
        public string State { get; set; } = "";
        public string? AssignedTo { get; set; }
        public string? CreatedBy { get; set; }
        public double? StoryPoints { get; set; }
        public List<string> Tags { get; set; } = new();
        public int? ParentId { get; set; }
        /// <summary>Non-Task children only - a Feature's Tasks (if any) aren't fetched or shown here.</summary>
        public List<int> ChildIds { get; set; } = new();
        public string? BoardLane { get; set; }
        public string? BoardColumn { get; set; }
        public double? StackRank { get; set; }
    }

    /// <summary>
    /// The Refinement board's data, for either of its two sources: the product backlog (
    /// <see cref="Board"/> set, <see cref="FeatureIds"/> in board/StackRank order) or a single sprint
    /// (<see cref="Board"/> null - no swimlanes, just the sprint's own Features/User Stories/Bugs and
    /// whatever Epic/Feature parents they need for context).
    /// </summary>
    public sealed class ProductBacklogDto
    {
        public ProductBacklogBoardDto? Board { get; set; }
        public List<int> FeatureIds { get; set; } = new();
        public List<ProductBacklogItemDto> Items { get; set; } = new();
    }
}
