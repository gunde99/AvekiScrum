using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Models.DTOs.Developer
{
    public record RepoInfo(string Id, string Name)
    {
        public override string ToString() => Name;
    }
}
