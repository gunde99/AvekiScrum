using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Shared.Enums;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public class TeamRoleProvider : ITeamRoleProvider
    {
        private readonly Dictionary<string, TeamRoleType> _memberToRole;
        private readonly Dictionary<TeamRoleType, List<string>> _roleToMember;
        private readonly Dictionary<string, List<string>> _roleGroupToMember;

        public TeamRoleProvider(IOptions<TeamRoleConfig> opt)
        {
            var entries = (opt.Value.TeamRoleMapping ?? new Dictionary<string, List<string>>())
                .Select(kvp => new
                {
                    Role = ParseRoleKey(kvp.Key),
                    Group = ParseGroupKey(kvp.Key),
                    Members = kvp.Value ?? new List<string>()
                })
                .Where(entry => entry.Role != TeamRoleType.Undefined)
                .ToList();

            _roleToMember = entries
                .GroupBy(entry => entry.Role)
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .SelectMany(entry => entry.Members)
                        .Where(member => !string.IsNullOrWhiteSpace(member))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList());

            _memberToRole = entries
                .SelectMany(entry => entry.Members
                    .Where(member => !string.IsNullOrWhiteSpace(member))
                    .Select(member => new { Member = member, entry.Role }))
                .GroupBy(x => x.Member, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(x => x.Role).OrderBy(RolePriority).First(),
                    StringComparer.OrdinalIgnoreCase);

            _roleGroupToMember = entries
                .Where(entry => !string.IsNullOrWhiteSpace(entry.Group))
                .GroupBy(entry => RoleGroupKey(entry.Role, entry.Group))
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .SelectMany(entry => entry.Members)
                        .Where(member => !string.IsNullOrWhiteSpace(member))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList(),
                    StringComparer.OrdinalIgnoreCase);
        }

        public List<string> GetAllTeamMembersForRole(TeamRoleType roleType)
        {
            return _roleToMember.TryGetValue(roleType, out var members)
                ? members
                : new List<string>();
        }

        public TeamRoleType GetRoleTypeForMember(string uniqueName)
            => _memberToRole.TryGetValue(uniqueName, out var role)
                ? role
                : TeamRoleType.Undefined;

        public List<string> GetTeamMembersForRoleGroup(
            TeamRoleType roleType,
            string groupName)
            => _roleGroupToMember.TryGetValue(
                RoleGroupKey(roleType, groupName),
                out var members)
                ? members
                : new List<string>();

        private static TeamRoleType ParseRoleKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
                return TeamRoleType.Undefined;

            foreach (var role in Enum.GetValues<TeamRoleType>().Where(role => role != TeamRoleType.Undefined))
            {
                if (key.StartsWith(role.ToString(), StringComparison.OrdinalIgnoreCase))
                    return role;
            }

            return TeamRoleType.Undefined;
        }

        private static string ParseGroupKey(string key)
        {
            foreach (var role in Enum.GetValues<TeamRoleType>()
                         .Where(role => role != TeamRoleType.Undefined))
            {
                var prefix = role.ToString();
                if (key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    return key[prefix.Length..];
            }

            return string.Empty;
        }

        private static string RoleGroupKey(
            TeamRoleType roleType,
            string groupName)
            => $"{roleType}:{NormalizeGroupName(groupName)}";

        private static string NormalizeGroupName(string groupName)
            => new(groupName
                .Where(char.IsLetterOrDigit)
                .Select(char.ToLowerInvariant)
                .ToArray());

        private static int RolePriority(TeamRoleType role)
            => role switch
            {
                TeamRoleType.Developers => 0,
                TeamRoleType.QAEngineers => 1,
                TeamRoleType.DevOps => 2,
                TeamRoleType.TeamLeaders => 3,
                TeamRoleType.ProductOwners => 4,
                TeamRoleType.TechnicalWriter => 5,
                TeamRoleType.Stakeholders => 6,
                _ => 99
            };
    }
}
