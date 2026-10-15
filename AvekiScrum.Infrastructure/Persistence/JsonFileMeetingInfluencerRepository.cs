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
    /// A single JSON file under MeetingInfluencerSettings.DataDirectory holding every draw, any
    /// date - same shape and same SemaphoreSlim-guarded read-modify-write as
    /// JsonFileTalkingPointRepository.
    /// </summary>
    public sealed class JsonFileMeetingInfluencerRepository : IMeetingInfluencerRepository
    {
        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

        private readonly string _dataDirectory;
        private readonly SemaphoreSlim _gate = new(1, 1);

        public JsonFileMeetingInfluencerRepository(IOptions<MeetingInfluencerSettings> settings)
        {
            var configured = settings.Value.DataDirectory;
            _dataDirectory = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        public async Task<IReadOnlyList<MeetingInfluencer>> GetAllAsync(CancellationToken ct = default)
            => (await ReadAsync(ct)).OrderBy(i => i.MeetingDate, StringComparer.Ordinal).ThenBy(i => i.DrawnAt).ToList();

        public async Task<IReadOnlyList<MeetingInfluencer>> GetForDateAsync(string meetingDate, CancellationToken ct = default)
            => (await ReadAsync(ct)).Where(i => i.MeetingDate == meetingDate).OrderBy(i => i.DrawnAt).ToList();

        public async Task<MeetingInfluencer> AddAsync(MeetingInfluencer influencer, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                var duplicate = existing.FirstOrDefault(i =>
                    i.MeetingDate == influencer.MeetingDate &&
                    string.Equals(i.Email, influencer.Email, StringComparison.OrdinalIgnoreCase));
                if (duplicate is not null) return duplicate;

                influencer.Id = Guid.NewGuid().ToString("N");
                existing.Add(influencer);
                await WriteAsync(existing, ct);
                return influencer;
            }
            finally
            {
                _gate.Release();
            }
        }

        public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var existing = await ReadAsync(ct);
                var removed = existing.RemoveAll(i => i.Id == id) > 0;
                if (removed) await WriteAsync(existing, ct);
                return removed;
            }
            finally
            {
                _gate.Release();
            }
        }

        private string FilePath => Path.Combine(_dataDirectory, "meeting-influencers.json");

        private async Task<List<MeetingInfluencer>> ReadAsync(CancellationToken ct)
        {
            var path = FilePath;
            if (!File.Exists(path))
                return new List<MeetingInfluencer>();

            await using var stream = File.OpenRead(path);
            var entries = await JsonSerializer.DeserializeAsync<List<MeetingInfluencer>>(stream, SerializerOptions, ct);
            return entries ?? new List<MeetingInfluencer>();
        }

        private async Task WriteAsync(List<MeetingInfluencer> entries, CancellationToken ct)
        {
            Directory.CreateDirectory(_dataDirectory);
            var path = FilePath;
            // Temp file + swap, same as JsonFileTalkingPointRepository - never a half-written file.
            var tempPath = path + ".tmp";
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, entries, SerializerOptions, ct);
            }
            File.Move(tempPath, path, overwrite: true);
        }
    }
}
