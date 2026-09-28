using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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
    /// One JSON file per team under DailyCheckInSettings.DataDirectory - there is no database in
    /// this app yet, and this is deliberately the simplest thing that can hold a few sprints' worth
    /// of check-in numbers while the retro-facing view around them gets designed. A per-team
    /// SemaphoreSlim serializes the read-modify-write so two overlapping saves (e.g. both teams'
    /// dailies finishing around the same time) can't race each other's file.
    /// </summary>
    public sealed class JsonFileDailyCheckInRepository : IDailyCheckInRepository
    {
        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

        private readonly string _dataDirectory;
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);

        public JsonFileDailyCheckInRepository(IOptions<DailyCheckInSettings> settings)
        {
            var configured = settings.Value.DataDirectory;
            _dataDirectory = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        public async Task UpsertAsync(IReadOnlyList<DailyCheckIn> entries, CancellationToken ct = default)
        {
            if (entries.Count == 0)
                return;

            foreach (var teamGroup in entries.GroupBy(e => e.Team, StringComparer.OrdinalIgnoreCase))
            {
                var gate = _locks.GetOrAdd(teamGroup.Key, _ => new SemaphoreSlim(1, 1));
                await gate.WaitAsync(ct);
                try
                {
                    var existing = await ReadAsync(teamGroup.Key, ct);
                    var incoming = teamGroup.ToList();

                    // Replaces rather than appends: anything already on disk that shares an
                    // incoming entry's (SprintPath, Date, Kind, Key) identity is dropped first, so
                    // a repeated save for the same day overwrites that day's number instead of
                    // sitting alongside a stale duplicate of it.
                    var incomingKeys = incoming
                        .Select(e => (e.SprintPath, e.Date, e.Kind, e.Key))
                        .ToHashSet();
                    var kept = existing.Where(e => !incomingKeys.Contains((e.SprintPath, e.Date, e.Kind, e.Key)));

                    var merged = kept.Concat(incoming)
                        .OrderBy(e => e.Date)
                        .ThenBy(e => e.Kind, StringComparer.OrdinalIgnoreCase)
                        .ThenBy(e => e.Key, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    await WriteAsync(teamGroup.Key, merged, ct);
                }
                finally
                {
                    gate.Release();
                }
            }
        }

        public async Task<IReadOnlyList<DailyCheckIn>> GetByTeamAsync(DeveloperTeam team, CancellationToken ct = default)
            => await ReadAsync(team.ToString(), ct);

        private async Task<List<DailyCheckIn>> ReadAsync(string team, CancellationToken ct)
        {
            var path = PathFor(team);
            if (!File.Exists(path))
                return new List<DailyCheckIn>();

            await using var stream = File.OpenRead(path);
            var entries = await JsonSerializer.DeserializeAsync<List<DailyCheckIn>>(stream, SerializerOptions, ct);
            return entries ?? new List<DailyCheckIn>();
        }

        private async Task WriteAsync(string team, List<DailyCheckIn> entries, CancellationToken ct)
        {
            Directory.CreateDirectory(_dataDirectory);
            var path = PathFor(team);
            // Written to a temp file and swapped in, rather than truncated in place, so a crash or
            // a concurrent read mid-write can never observe a half-written file.
            var tempPath = path + ".tmp";
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, entries, SerializerOptions, ct);
            }
            File.Move(tempPath, path, overwrite: true);
        }

        private string PathFor(string team) => Path.Combine(_dataDirectory, $"{team}.json");
    }
}
