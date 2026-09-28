using System;
using System.Collections.Generic;
using System.Text.Json;
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

        [JsonPropertyName("Microsoft.VSTS.Common.StateChangeDate")]
        public DateTime? StateChangeDate { get; set; }

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

        /// <summary>The Kanban board's own column/lane fields - only meaningful for a Feature read
        /// through a team's "Features" board (see AzureDevOpsBoardsClient.GetProductBacklogAsync).</summary>
        [JsonPropertyName("System.BoardColumn")]
        public string BoardColumn { get; set; }

        [JsonPropertyName("System.BoardLane")]
        public string BoardLane { get; set; }

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

        /// <summary>The build a fix shipped in ("BETA #20260913.3") - Azure's native "Integrated in
        /// Build" field, set by the build pipeline rather than by hand. Shown to testers so they
        /// know which build to verify a fix against.</summary>
        [JsonPropertyName("Microsoft.VSTS.Build.IntegrationBuild")]
        public string IntegrationBuild { get; set; }

        [JsonPropertyName("Custom.AssignedTeam")]
        public string AssignedTeam { get; set; }

        [JsonPropertyName("Custom.DevelopmentPartner")]
        public IdentityRef DevelopmentPartner { get; set; }

        [JsonPropertyName("Custom.Source")]
        public string Source { get; set; }

        [JsonPropertyName("Custom.Stakeholders")]
        public string Stakeholders { get; set; }

        /// <summary>Work item revision - used to stamp Custom.DoRRevision at approval time, so a
        /// later change to the card can be told apart from the one that was reviewed.</summary>
        [JsonPropertyName("System.Rev")]
        public int? Rev { get; set; }

        /// <summary>"Ready" / "Ready with risk" / "Needs refinement" / "Not assessed" - the DoR tag
        /// only records that a card has been reviewed, not how it went; this is where that
        /// actually lives. See WorkItemReadyCheckTab.</summary>
        [JsonPropertyName("Custom.DoRStatus")]
        public string DoRStatus { get; set; }

        /// <summary>The INVEST checklist, the ready-check answers and any comment, composed into one
        /// readable-and-parsable html blob - see dorDecisionLogic.ts on the client.</summary>
        [JsonPropertyName("Custom.DoRDecision")]
        public string DoRDecision { get; set; }

        /// <summary>
        /// An Identity field, like AssignedTo - Azure resolves whatever email/name is written into
        /// it into a full identity object, so this has to deserialize as one too. Modeling it as a
        /// plain string (an earlier version of this code did) throws on every read once the field
        /// actually has a value, which - swallowed by the batch fetch's own error handling - is
        /// what surfaced as cards mysteriously "not found" the moment DoRApprovedBy was first set.
        /// </summary>
        [JsonPropertyName("Custom.DoRApprovedBy")]
        public IdentityRef DoRApprovedBy { get; set; }

        [JsonPropertyName("Custom.DoRApprovedDate")]
        public DateTime? DoRApprovedDate { get; set; }

        /// <summary>The card's System.Rev at the moment it was reviewed.</summary>
        [JsonPropertyName("Custom.DoRRevision")]
        public int? DoRRevision { get; set; }

        /// <summary>
        /// Link to the case in Lime, the CRM support works in. Note the lowercase "l" - that is
        /// how the field is actually named in the process ("Custom.Externallink"), and getting it
        /// wrong silently yields null rather than an error.
        /// </summary>
        [JsonPropertyName("Custom.Externallink")]
        public string ExternalLink { get; set; }

        /// <summary>Sakkunnig-kandidat på en Feature - Identity field, same reasoning as
        /// DoRApprovedBy above. Up to three; empty ones just come back null.</summary>
        [JsonPropertyName("Custom.Kandidat1")]
        public IdentityRef Kandidat1 { get; set; }

        [JsonPropertyName("Custom.Kandidat2")]
        public IdentityRef Kandidat2 { get; set; }

        [JsonPropertyName("Custom.Kandidat3")]
        public IdentityRef Kandidat3 { get; set; }

        /// <summary>Free-text context for whoever picks a Sakkunnig from the candidates above -
        /// copied verbatim into the new User Story's Description when one is appointed.</summary>
        [JsonPropertyName("Custom.SakkunnigInfo")]
        public string SakkunnigInfo { get; set; }

        /// <summary>
        /// Everything not mapped to a property above. A Feature/Epic board's own Kanban column and
        /// lane live in a *per-team, per-backlog-level custom field* (Azure generates a name like
        /// "WEF_&lt;hash&gt;_Kanban.Column" for each board), not the fixed System.BoardColumn/
        /// System.BoardLane those two fields cover - which only apply to the single, org-wide
        /// Requirements-level board. GetProductBacklogAsync resolves the real reference name from
        /// the board's own config and reads it out of here.
        /// </summary>
        [JsonExtensionData]
        public Dictionary<string, JsonElement> ExtensionData { get; set; }
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
