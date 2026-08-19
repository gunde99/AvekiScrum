using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal static class WiqlHelper
    {
        public static string Escape(string? s) => s?.Replace("'", "''") ?? string.Empty;

        public static string BuildAreaPathWhereClause(IEnumerable<string>? areaPaths)
        {
            var items = (areaPaths ?? Enumerable.Empty<string>())
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => $"[System.AreaPath] = '{Escape(p)}'");

            var joined = string.Join(" OR ", items);
            return string.IsNullOrWhiteSpace(joined) ? string.Empty : $"({joined})";
        }
    }
}
