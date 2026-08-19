namespace AvekiScrum.Application.Models.Enums
{
    public enum WorkItemType
    {
        UserStory,
        Bug,
        Task,
        Epic,
        Feature,
        TestCase
    }

    //Helper class
    public static class WorkItemTypeExtensions
    {
        public static string ToAzureDevOpsString(this WorkItemType workItemType)
        {
            return workItemType switch
            {
                WorkItemType.UserStory => "User Story",
                WorkItemType.Bug => "Bug",
                WorkItemType.Task => "Task",
                WorkItemType.Epic => "Epic",
                WorkItemType.Feature => "Feature",
                _ => workItemType.ToString()
            };
        }
    }

    public enum WorkItemState
    {
        New,
        Active,
        Resolved,
        Done,
        Closed,
        Removed,
        Design
    }

    public enum WorkItemSource
    {
        Unset,
        Customer,
        Development,
        Internal,
        Test
    }
}
