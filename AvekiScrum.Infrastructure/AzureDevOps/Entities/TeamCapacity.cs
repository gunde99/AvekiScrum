using System.Collections.Generic;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class TeamCapacity
    {
        public string TeamMember { get; set; }       // Name or ID of the team member
        public double AvailableHours { get; set; }   // Total available hours for the sprint
        public List<ActivityCapacity> Activities { get; set; } // Breakdown of capacity by activity
    }

    public class ActivityCapacity
    {
        public string Activity { get; set; }         // Activity type (e.g., Development, Testing)
        public double CapacityPerDay { get; set; }   // Hours available per day for the activity
    }
}
