using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class Role
    {
        public int Id { get; set; }
        public string Name { get; set; } = null!;

        // Skip-navigering mot TeamMember
        public ICollection<TeamMemberDto> Members { get; set; } = new List<TeamMemberDto>();
    }
}
