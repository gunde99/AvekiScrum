using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class TeamMemberEntity
    {
        [JsonPropertyName("identity")]
        public IdentityRef Identity { get; set; }

        [JsonPropertyName("role")]
        public string Role { get; set; }
    }

    public class TeamMemberList
    {
        [JsonPropertyName("value")]
        public List<TeamMemberEntity> Members { get; set; }
    }
}
