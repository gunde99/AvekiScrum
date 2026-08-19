namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class BoardColumn
    {
        public string Id { get; set; }               // Unique identifier for the board column
        public string Name { get; set; }             // Column name (e.g., To Do, In Progress, Done)
        public int Order { get; set; }               // Order of the column on the board
        public string StateMappings { get; set; }    // State mappings (e.g., maps the column to work item states)
        public bool IsSplitColumn { get; set; }      // Indicates if the column is a split column
    }
}