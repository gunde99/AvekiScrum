using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public enum DeveloperTeam
    {
        Nord,
        Syd
    }

    public class TeamMetadata
    {
        public string AzureDevOpsName { get; set; } // t.ex. "Team Nord"
        public string DisplayName { get; set; }     // t.ex. "Nord"
        public string ImageUrl { get; set; }        // ikon eller profilbild
        public string Description { get; set; } = string.Empty; // Beskrivning av teamet
        public string TeamUrl { get; set; } = string.Empty; // URL till teamets sida

    }

    public static class TeamInfo
    {
        public static readonly Dictionary<DeveloperTeam, TeamMetadata> Metadata =
            new()
            {
            {
                DeveloperTeam.Nord,
                new TeamMetadata
                {
                    AzureDevOpsName = "Team Nord",
                    DisplayName = "Nord",
                    ImageUrl = "https://dev.azure.com/Aveki/_apis/GraphProfile/MemberAvatars/vssgp.Uy0xLTktMTU1MTM3NDI0NS0yOTc3ODg4MTA0LTMxNjc5NjAzOTQtMjIwNDA4ODYzOC05NTY2MjkwMzMtMS0yNzA3Mjc1NjQxLTI4MTM2MTY5NjktMzE5Njg4OTgzOS0xOTI1MzIzOTQ0?size=2",
                    Description = "Team Nords utveckling",
                    TeamUrl = "Team%20Nord"
                }
            },
            {
                DeveloperTeam.Syd,
                new TeamMetadata
                {
                    AzureDevOpsName = "Team Syd",
                    DisplayName = "Syd",
                    ImageUrl = "https://dev.azure.com/Aveki/_apis/GraphProfile/MemberAvatars/vssgp.Uy0xLTktMTU1MTM3NDI0NS0yOTc3ODg4MTA0LTMxNjc5NjAzOTQtMjIwNDA4ODYzOC05NTY2MjkwMzMtMS0xNjExNzQ3OTg2LTE4Mzg3OTQ1NjgtMjk1MzgxNDgxOC0xNjE4NTg3MTQw?size=2",
                    Description = "Teams Syds utveckling",
                    TeamUrl = "Team%20Syd"
                }
            }
            };
    }

    public static class DeveloperTeamExtensions
    {
        public static TeamMetadata GetMetadata(this DeveloperTeam team)
        {
            return TeamInfo.Metadata.TryGetValue(team, out var data) ? data : null;
        }

        public static DeveloperTeam? FromAzureDevOpsName(string azureName)
        {
            foreach (var kvp in TeamInfo.Metadata)
            {
                if (kvp.Value.AzureDevOpsName.Equals(azureName, StringComparison.OrdinalIgnoreCase))
                    return kvp.Key;
            }
            return null;
        }
    }
}
