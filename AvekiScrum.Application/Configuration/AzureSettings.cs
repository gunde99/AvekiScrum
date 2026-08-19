using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Configuration
{
    public class AzureSettings
    {
        public required string PAT { get; set; } = string.Empty;
        public required string WikiId { get; set; } = string.Empty;
        public required string Organization { get; set; } = string.Empty;
        public required string Project { get; set; } = string.Empty;
        public required string BaseUrl { get; set; } = string.Empty;
    }
}
