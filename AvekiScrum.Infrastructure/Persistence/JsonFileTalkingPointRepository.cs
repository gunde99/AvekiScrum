using System;
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
    /// A single JSON file under TalkingPointSettings.DataDirectory holding every talking point,
    /// whatever team(s) it's scoped to - unlike JsonFileDailyCheckInRepository, a talking point
    /// isn't owned by one team's own file, since "Both" scope means the same item is tracked
    /// independently against both teams' raised state. One SemaphoreSlim serializes every
    /// read-modify-write so two overlapping edits (the settings modal and a running daily flow's
    /// "Lyft" click, say) can't race each other's file.
    /// </summary>
    public sealed class JsonFileTalkingPointRepository : ITalkingPointRepository
    {
        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

        private readonly string _dataDirectory;
        private readonly SemaphoreSlim _gate = new(1, 1);

        public JsonFileTalkingPointRepository(IOptions<TalkingPointSettings> settings)
        {
            var configured = settings.Value.DataDirectory;
            _dataDirectory = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        public async Task<IReadOnlyList<TalkingPoint>> GetAllAsync(CancellationToken ct = default)
            => await ReadAsync(ct);

        public async Task<IReadOnlyList<TalkingPoint>> GetForTeamAsync(DeveloperTeam team, CancellationToken ct = default)
        {
            var teamName = team.ToString();
            var all = await ReadAsync(ct);
            return all.Where(p => p.Scope == "Both" || string.Equals(p.Scope, teamName, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        public async Task<TalkingPoint> CreateAsync(TalkingPoint point, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                point.Id = Guid.NewGuid().ToString("N");
                existing.Add(point);
                await WriteAsync(existing, ct);
                return point;
            }
            finally
            {
                _gate.Release();
            }
        }

        public async Task<TalkingPoint?> UpdateAsync(string id, string bodyHtml, string assigneeEmail, string assigneeDisplayName, string scope, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                var point = existing.FirstOrDefault(p => p.Id == id);
                if (point is null) return null;

                point.BodyHtml = bodyHtml;
                point.AssigneeEmail = assigneeEmail;
                point.AssigneeDisplayName = assigneeDisplayName;
                point.Scope = scope;
                await WriteAsync(existing, ct);
                return point;
            }
            finally
            {
                _gate.Release();
            }
        }

        public async Task<TalkingPoint?> SetRaisedAsync(string id, string team, bool raised, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                var point = existing.FirstOrDefault(p => p.Id == id);
                if (point is null) return null;

                ApplyRaised(point, team, raised);
                await WriteAsync(existing, ct);
                return point;
            }
            finally
            {
                _gate.Release();
            }
        }

        public async Task SetAllRaisedAsync(string teamFilter, bool raised, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                if (existing.Count == 0) return;

                foreach (var point in existing)
                {
                    // "Nord"/"Syd": only items relevant to that team move - a Syd-only item is
                    // untouched by a Nord bulk action. "Both": everything moves, on both flags.
                    if (teamFilter != "Both" && point.Scope != "Both" && !string.Equals(point.Scope, teamFilter, StringComparison.OrdinalIgnoreCase))
                        continue;
                    ApplyRaised(point, teamFilter, raised);
                }
                await WriteAsync(existing, ct);
            }
            finally
            {
                _gate.Release();
            }
        }

        private static void ApplyRaised(TalkingPoint point, string team, bool raised)
        {
            var now = raised ? DateTimeOffset.UtcNow : (DateTimeOffset?)null;
            if (team is "Nord" or "Both")
            {
                point.NordRaised = raised;
                point.NordRaisedAt = now;
            }
            if (team is "Syd" or "Both")
            {
                point.SydRaised = raised;
                point.SydRaisedAt = now;
            }
        }

        public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                var removed = existing.RemoveAll(p => p.Id == id) > 0;
                if (removed) await WriteAsync(existing, ct);
                return removed;
            }
            finally
            {
                _gate.Release();
            }
        }

        private string FilePath => Path.Combine(_dataDirectory, "talking-points.json");

        private async Task<List<TalkingPoint>> ReadAsync(CancellationToken ct)
        {
            var path = FilePath;
            if (!File.Exists(path))
                return new List<TalkingPoint>();

            await using var stream = File.OpenRead(path);
            var entries = await JsonSerializer.DeserializeAsync<List<TalkingPoint>>(stream, SerializerOptions, ct);
            return entries ?? new List<TalkingPoint>();
        }

        private async Task WriteAsync(List<TalkingPoint> entries, CancellationToken ct)
        {
            Directory.CreateDirectory(_dataDirectory);
            var path = FilePath;
            // Written to a temp file and swapped in, rather than truncated in place, so a crash or a
            // concurrent read mid-write can never observe a half-written file.
            var tempPath = path + ".tmp";
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, entries, SerializerOptions, ct);
            }
            File.Move(tempPath, path, overwrite: true);
        }
    }
}
