using System;
using AvekiScrum.Application.Models.Enums;

namespace AvekiScrum.Application.Mappers
{
    //Borde egentligen kapslas in i Infrastructure men eftersom SprintSnapShot är en del av Domänen, så får mappningen ligga här.
    public static class AzureEnumMapper
    {
        public static WorkItemType MapType(string type)
        {
            return type switch
            {
                "User Story" => WorkItemType.UserStory,
                "Bug" => WorkItemType.Bug,
                "Task" => WorkItemType.Task,
                "Epic" => WorkItemType.Epic,
                "Feature" => WorkItemType.Feature,
                "Test Case" => WorkItemType.TestCase,
                _ => throw new ArgumentOutOfRangeException(nameof(type), $"Unknown work item type: {type}")
            };
        }

        public static WorkItemState MapState(string state)
        {
            return state switch
            {
                "New" => WorkItemState.New,
                "Active" => WorkItemState.Active,
                "Resolved" => WorkItemState.Resolved,
                "Done" => WorkItemState.Done,
                "Closed" => WorkItemState.Closed,
                "Removed" => WorkItemState.Removed,
                "Design" => WorkItemState.Design,
                _ => throw new ArgumentOutOfRangeException(nameof(state), $"Unknown state: {state}")
            };
        }

        public static WorkItemSource MapSource(string source)
        {
            if (string.IsNullOrWhiteSpace(source))
                return WorkItemSource.Unset;

            return source switch
            {
                "Customer" => WorkItemSource.Customer,
                "Development" => WorkItemSource.Development,
                "Internal" => WorkItemSource.Internal,
                "Test" => WorkItemSource.Test,
                _ => throw new ArgumentOutOfRangeException(nameof(source), $"Unknown source: {source}")
            };
        }
    }
}
