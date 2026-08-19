using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Shared.Enums;

namespace AvekiScrum.Application.Configuration
{
    public class TeamRoleConfig
    {
        public Dictionary<string, List<string>> TeamRoleMapping { get; set; }
            = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
    }
}
