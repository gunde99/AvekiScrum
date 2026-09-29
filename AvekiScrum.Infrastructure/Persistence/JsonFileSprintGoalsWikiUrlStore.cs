using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions.Repositories;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Domain.Entities.Scrum;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Infrastructure.Persistence
{
    /// <summary>
    /// A single small JSON file mapping team name -> wiki url override. Same read-modify-write,
    /// semaphore-guarded, temp-file-then-move pattern as the other JSON-file stores in this app.
    /// </summary>
    public sealed class JsonFileSprintGoalsWikiUrlStore : ISprintGoalsWikiUrlStore
    {
        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

        private readonly string _dataDirectory;
        private readonly SemaphoreSlim _gate = new(1, 1);

        public JsonFileSprintGoalsWikiUrlStore(IOptions<SprintGoalsWikiUrlSettings> settings)
        {
            var configured = settings.Value.DataDirectory;
            _dataDirectory = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        public async Task<string?> GetOverrideAsync(DeveloperTeam team, CancellationToken ct = default)
        {
            var map = await ReadAsync(ct);
            return map.TryGetValue(team.ToString(), out var url) && !string.IsNullOrWhiteSpace(url) ? url : null;
        }

        public async Task SetOverrideAsync(DeveloperTeam team, string wikiUrl, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var map = await ReadAsync(ct);
                map[team.ToString()] = wikiUrl;
                await WriteAsync(map, ct);
            }
            finally
            {
                _gate.Release();
            }
        }

        private string FilePath => Path.Combine(_dataDirectory, "overrides.json");

        private async Task<Dictionary<string, string>> ReadAsync(CancellationToken ct)
        {
            var path = FilePath;
            if (!File.Exists(path))
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            await using var stream = File.OpenRead(path);
            var map = await JsonSerializer.DeserializeAsync<Dictionary<string, string>>(stream, SerializerOptions, ct);
            return map ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        private async Task WriteAsync(Dictionary<string, string> map, CancellationToken ct)
        {
            Directory.CreateDirectory(_dataDirectory);
            var path = FilePath;
            var tempPath = path + ".tmp";
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, map, SerializerOptions, ct);
            }
            File.Move(tempPath, path, overwrite: true);
        }
    }
}
