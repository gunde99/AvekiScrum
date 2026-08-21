using System;
using System.Collections.Generic;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{

    public class WorkItemDto
    {
        public int Id { get; set; }
        public int SystemId { get; set; }
        public string Title { get; set; }
        public string State { get; set; }
        public string Type { get; set; }
        public string AssignedTo { get; set; }
        public string AssignedToEmail { get; set; }
        public string DevelopmentPartner { get; set; }
        public string CreatedBy { get; set; }
        public int? Priority { get; set; }
        public string Severity { get; set; }
        public double? StoryPoints { get; set; }
        public int SPInt => (int)Math.Round(StoryPoints ?? 0.0);
        public string AreaPath { get; set; }
        public string IterationPath { get; set; }
        public string Activity { get; set; }
        public string Blocked { get; set; }
        public bool IsBlocked { get; set; }
        public string AssignedTeam { get; set; }
        public string Source { get; set; }
        public List<string> Stakeholders { get; set; } = new();
        //Tags
        public List<string> Tags { get; set; } = new List<string>();

        public DateTime CreatedDate { get; set; }
        public DateTime? ClosedDate { get; set; }
        public DateTime? ResolvedDate { get; set; }
        public DateTime? ChangedDate { get; set; }

        public DeveloperTeam Team { get; set; }


        // Typ-säkra properties
        public WorkItemType TypeEnum { get; set; }
        public WorkItemState StateEnum { get; set; }
        public WorkItemSource SourceEnum { get; set; }

        // Relationer

        // WorkItems Parent/Children
        public int? ParentId { get; set; }           // <-- NY
        public List<int> ChildIds { get; set; } = new(); // <-- valfri men sjukt användbar

        // Commits/Pullrequests
        public List<PullRequestSimpleDto> PullRequests { get; set; } = new();
        public List<CommitDto> Commits { get; set; } = new();


        // Nrb of days that the item has been in its current state
        //Calculated property from ChangedDate and current date
        public int? DaysInStatus => (int?)(StateEnum == WorkItemState.Closed ? null : (int)Math.Round((DateTime.UtcNow - (ChangedDate?.ToUniversalTime() ?? DateTime.UtcNow)).TotalDays));
    }
}
