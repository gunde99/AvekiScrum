using System;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class WorkItemHistory
    {
        public int Id { get; set; }                  // History entry ID
        public int WorkItemId { get; set; }          // Associated work item ID
        public string ChangedBy { get; set; }        // User who made the change
        public DateTime ChangedDate { get; set; }    // Date when the change was made
        public string Field { get; set; }            // Field that was changed
        public string OldValue { get; set; }         // Previous value before the change
        public string NewValue { get; set; }         // Updated value after the change
    }
}
