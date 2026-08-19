using System;
using AvekiScrum.Shared.Enums;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class TeamMemberDto
    {
        public int Id { get; set; }                 // PK
        public string AzureId { get; set; } = null!; // AzureDevOps‐ID
        public string DisplayName { get; set; } = null!;
        public string UniqueName { get; set; } = null!; // t.ex. UPN
        public string Email { get; set; } = null!;
        public string Title { get; set; } = null!;
        public string TeamName { get; set; } = null!;  // t.ex. "Team A"
        public DateTime LastSynced { get; set; }

        public string ImageUrl { get; set; }
        public string Descriptor { get; set; }
        public string Role { get; set; } //Admin eller Member (från Azure)

        public TeamRoleType RoleType { get; set; }

        public bool IsConsultant
        {
            get
            {
                return RoleType == TeamRoleType.QAEngineers;
            }
        }

        public bool IsDeveloper
        {
            get
            {
                return RoleType == TeamRoleType.Developers;
            }
        }
    }
}
