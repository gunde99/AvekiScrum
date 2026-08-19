using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Shared.Enums
{
    public enum TeamRoleType
    {
        Undefined,
        Developers,
        Stakeholders,
        ProductOwners,
        QAEngineers,
        DevOps,
        TeamLeaders,
        TechnicalWriter
    }

    public static class TeamRoleTypeExtensions
    {
        public static string ToDisplayName(this TeamRoleType role)
            => role switch
            {
                TeamRoleType.Developers => "Developer",
                TeamRoleType.Stakeholders => "Stakeholder",
                TeamRoleType.ProductOwners => "Product Owner",
                TeamRoleType.QAEngineers => "QA Engineer",
                TeamRoleType.DevOps => "DevOps",
                TeamRoleType.TeamLeaders => "Team Leader",
                TeamRoleType.TechnicalWriter => "Technical Writer",
                _ => role.ToString()
            };
    }
}
