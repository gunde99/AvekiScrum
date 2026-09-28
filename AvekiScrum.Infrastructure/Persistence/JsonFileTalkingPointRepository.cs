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
    /// One JSON file per team under TalkingPointSettings.DataDirectory - same rationale and shape as
    /// JsonFileDailyCheckInRepository. A per-team SemaphoreSlim serializes every read-modify-write so
    /// two overlapping edits (the settings page and a running daily flow, say) can't race each other's
    /// file.
    /// </summary>
    public sealed class JsonFileTalkingPointRepository : ITalkingPointRepository
    {
        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

        private readonly string _dataDirectory;
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);

        public JsonFileTalkingPointRepository(IOptions<TalkingPointSettings> settings)
        {
            var configured = settings.Value.DataDirectory;
            _dataDirectory = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        public async Task<IReadOnlyList<TalkingPoint>> GetByTeamAsync(DeveloperTeam team, CancellationToken ct = default)
            => await ReadAsync(team.ToString(), ct);

        public async Task<TalkingPoint> CreateAsync(DeveloperTeam team, TalkingPoint point, CancellationToken ct = default)
        {
            var teamKey = team.ToString();
            var gate = _locks.GetOrAdd(teamKey, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(teamKey, ct);
                point.Id = Guid.NewGuid().ToString("N");
                point.Team = teamKey;
                existing.Add(point);
                await WriteAsync(teamKey, existing, ct);
                return point;
            }
            finally
            {
                gate.Release();
            }
        }

        public async Task<TalkingPoint?> UpdateAsync(DeveloperTeam team, string id, string bodyHtml, string assigneeEmail, string assigneeDisplayName, CancellationToken ct = default)
        {
            var teamKey = team.ToString();
            var gate = _locks.GetOrAdd(teamKey, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(teamKey, ct);
                var point = existing.FirstOrDefault(p => p.Id == id);
                if (point is null) return null;

                point.BodyHtml = bodyHtml;
                point.AssigneeEmail = assigneeEmail;
                point.AssigneeDisplayName = assigneeDisplayName;
                await WriteAsync(teamKey, existing, ct);
                return point;
            }
            finally
            {
                gate.Release();
            }
        }

        public async Task<TalkingPoint?> SetRaisedAsync(DeveloperTeam team, string id, bool raised, CancellationToken ct = default)
        {
            var teamKey = team.ToString();
            var gate = _locks.GetOrAdd(teamKey, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(teamKey, ct);
                var point = existing.FirstOrDefault(p => p.Id == id);
                if (point is null) return null;

                point.Raised = raised;
                point.RaisedAt = raised ? DateTimeOffset.UtcNow : null;
                await WriteAsync(teamKey, existing, ct);
                return point;
            }
            finally
            {
                gate.Release();
            }
        }

        public async Task SetAllRaisedAsync(DeveloperTeam team, bool raised, CancellationToken ct = default)
        {
            var teamKey = team.ToString();
            var gate = _locks.GetOrAdd(teamKey, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(teamKey, ct);
                if (existing.Count == 0) return;

                var now = raised ? DateTimeOffset.UtcNow : (DateTimeOffset?)null;
                foreach (var point in existing)
                {
                    point.Raised = raised;
                    point.RaisedAt = now;
                }
                await WriteAsync(teamKey, existing, ct);
            }
            finally
            {
                gate.Release();
            }
        }

        public async Task<bool> DeleteAsync(DeveloperTeam team, string id, CancellationToken ct = default)
        {
            var teamKey = team.ToString();
            var gate = _locks.GetOrAdd(teamKey, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(teamKey, ct);
                var removed = existing.RemoveAll(p => p.Id == id) > 0;
                if (removed) await WriteAsync(teamKey, existing, ct);
                return removed;
            }
            finally
            {
                gate.Release();
            }
        }

        private async Task<List<TalkingPoint>> ReadAsync(string team, CancellationToken ct)
        {
            var path = PathFor(team);
            if (!File.Exists(path))
                return new List<TalkingPoint>();

            await using var stream = File.OpenRead(path);
            var entries = await JsonSerializer.DeserializeAsync<List<TalkingPoint>>(stream, SerializerOptions, ct);
            return entries ?? new List<TalkingPoint>();
        }

        private async Task WriteAsync(string team, List<TalkingPoint> entries, CancellationToken ct)
        {
            Directory.CreateDirectory(_dataDirectory);
            var path = PathFor(team);
            // Written to a temp file and swapped in, rather than truncated in place, so a crash or a
            // concurrent read mid-write can never observe a half-written file.
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
