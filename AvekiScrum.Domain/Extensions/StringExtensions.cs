using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Shared.Extensions
{
    public static class StringExtensions
    {
        public static List<string> Normalize(this List<string> stringList)
            => stringList?.Select(s => s.Normalize()).ToList() ?? new List<string>();

        public static string Normalize(this string str)
            => str?.Trim().ToLowerInvariant() ?? string.Empty;

    }
}
