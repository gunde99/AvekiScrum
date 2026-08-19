namespace AvekiScrum.Domain.Entities
{
    public class WorkItemSnapshot
    {
        public int Id { get; set; } //EF Id
        public int WorkItemId { get; set; }   // Azure DevOps Work Item ID
        public string WorkItemType { get; set; } = null!;  // "User Story", "Bug", "Task"
        public string State { get; set; } = null!;
        public string Title { get; set; } = null!;
        public string AssignedTo { get; set; } = null!;
        public string AreaPath { get; set; } = null!;
        public int StoryPoints { get; set; }  // Story Points for User Stories
        public int HoursSpent { get; set; }  // Hours spent on the work item

        //Navigation to parent table
        public int SprintBoardSnapshotId { get; set; }
        public SprintBoardSnapshot SprintBoardSnapshot { get; set; } = null!;
        public string AssignedTeam { get; set; }
    }
}
