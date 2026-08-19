using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;
using AvekiScrum.Shared.Enums;

namespace AvekiScrum.Application.Abstractions.Services
{
    public interface ITeamRoleProvider
    {
        /// <summary>
        /// Returnerar rollen för angiven medlem (uniqueName/email), eller null om ingen är konfigurerad.
        /// </summary>
        TeamRoleType GetRoleTypeForMember(string uniqueName);

        List<string> GetAllTeamMembersForRole(TeamRoleType roleType);

        /// <summary>
        /// Returnerar konfigurerade medlemmar för en roll och en namngiven
        /// grupp, exempelvis Developers + "Team Nord".
        /// </summary>
        List<string> GetTeamMembersForRoleGroup(
            TeamRoleType roleType,
            string groupName);
    }
}
