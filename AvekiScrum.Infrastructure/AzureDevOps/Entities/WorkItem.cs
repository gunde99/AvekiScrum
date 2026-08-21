using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class WiqlWorkItemResponse
    {
        public string queryType { get; set; }
        public string queryResultType { get; set; }
        public DateTime asOf { get; set; }
        public Column[] columns { get; set; }

        [JsonPropertyName("workItems")]
        public WiqlWorkItemRef[] workItemReferences { get; set; }
    }

    public class Column
    {
        public string referenceName { get; set; }
        public string name { get; set; }
        public string url { get; set; }
    }

    public class WiqlWorkItemRef
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("url")]
        public string Url { get; set; } = string.Empty;
    }

    /// <summary>
    /// Nodobjekt för att representera ett US/Bugs i ett träd.
    /// </summary>
    public class WorkItemNode
    {
        public WorkItemWithFields Item { get; set; }

        public WorkItemWithFields Parent { get; set; }
        public List<WorkItemWithFields> Children { get; set; } = new();
        public List<WorkItemWithFields> Relatives { get; set; } = new();
    }

    public class WorkItemWithFields
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("fields")]
        public WorkItemFields Fields { get; set; }

        [JsonPropertyName("relations")]
        public List<WorkItemRelation> Relations { get; set; }

        // För internt trädbyggande
        [JsonIgnore]
        public List<WorkItemWithFields> Children { get; set; } = new();
    }

    public class WorkItemRelation
    {
        [JsonPropertyName("rel")]
        public string Rel { get; set; }

        [JsonPropertyName("url")]
        public string Url { get; set; }

        [JsonPropertyName("attributes")]
        public Dictionary<string, object> Attributes { get; set; }
    }

    public class WorkItemFields
    {
        [JsonPropertyName("System.Id")]
        public int SystemId { get; set; }

        [JsonPropertyName("System.Title")]
        public string Title { get; set; }

        [JsonPropertyName("System.State")]
        public string State { get; set; }

        [JsonPropertyName("System.WorkItemType")]
        public string WorkItemType { get; set; }

        [JsonPropertyName("System.AssignedTo")]
        public IdentityRef AssignedTo { get; set; }

        [JsonPropertyName("System.CreatedDate")]
        public DateTime CreatedDate { get; set; }

        [JsonPropertyName("System.ChangedDate")]
        public DateTime ChangedDate { get; set; }

        [JsonPropertyName("System.CreatedBy")]
        public IdentityRef CreatedBy { get; set; }

        [JsonPropertyName("System.ChangedBy")]
        public IdentityRef ChangedBy { get; set; }

        [JsonPropertyName("System.AreaPath")]
        public string AreaPath { get; set; }

        [JsonPropertyName("System.IterationPath")]
        public string IterationPath { get; set; }

        [JsonPropertyName("System.TeamProject")]
        public string TeamProject { get; set; }

        [JsonPropertyName("System.Reason")]
        public string Reason { get; set; }

        [JsonPropertyName("System.Tags")]
        public string Tags { get; set; }

        [JsonPropertyName("System.Description")]
        public string Description { get; set; }

        [JsonPropertyName("Microsoft.VSTS.TCM.ReproSteps")]
        public string ReproSteps { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.AcceptanceCriteria")]
        public string AcceptanceCriteria { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Scheduling.StoryPoints")]
        public double? StoryPoints { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.Priority")]
        public int? Priority { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.Severity")]
        public string Severity { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.ValueArea")]
        public string ValueArea { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.BusinessValue")]
        public int? BusinessValue { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.StackRank")]
        public double? StackRank { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.Activity")]
        public string Activity { get; set; }

        [JsonPropertyName("Microsoft.VSTS.CMMI.Blocked")]
        public string Blocked { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Scheduling.OriginalEstimate")]
        public double? OriginalEstimate { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Scheduling.RemainingWork")]
        public double? RemainingWork { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Scheduling.CompletedWork")]
        public double? CompletedWork { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.ResolvedDate")]
        public DateTime? ResolvedDate { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.ResolvedBy")]
        public IdentityRef ResolvedBy { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.Resolution")]
        public string Resolution { get; set; }

        [JsonPropertyName("Microsoft.VSTS.Common.ClosedDate")]
        public DateTime? ClosedDate { get; set; }

        [JsonPropertyName("Custom.AssignedTeam")]
        public string AssignedTeam { get; set; }

        [JsonPropertyName("Custom.DevelopmentPartner")]
        public IdentityRef DevelopmentPartner { get; set; }

        [JsonPropertyName("Custom.Source")]
        public string Source { get; set; }

        [JsonPropertyName("Custom.Stakeholders")]
        public string Stakeholders { get; set; }

        /// <summary>
        /// Link to the case in Lime, the CRM support works in. Note the lowercase "l" - that is
        /// how the field is actually named in the process ("Custom.Externallink"), and getting it
        /// wrong silently yields null rather than an error.
        /// </summary>
        [JsonPropertyName("Custom.Externallink")]
        public string ExternalLink { get; set; }
    }

    public class IdentityRef
    {
        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; }

        [JsonPropertyName("uniqueName")]
        public string UniqueName { get; set; }

        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("imageUrl")]
        public string ImageUrl { get; set; }

        [JsonPropertyName("descriptor")]
        public string Descriptor { get; set; }
    }
}
