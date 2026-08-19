using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public static class WorkItemJsonStorage
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNamingPolicy = null
        };

        public static void SaveToJsonFile(IEnumerable<WorkItemDto> items, string filePath)
        {
            if (items == null)
                throw new ArgumentNullException(nameof(items));

            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("Filnamn saknas.", nameof(filePath));

            var directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrWhiteSpace(directory))
                Directory.CreateDirectory(directory);

            var json = JsonSerializer.Serialize(items, JsonOptions);

            var tempFile = filePath + ".tmp";

            File.WriteAllText(tempFile, json);

            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }

            File.Move(tempFile, filePath);
        }
    }
}
