using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions.Repositories;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Domain.Entities.Upgrade;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Infrastructure.Persistence
{
    /// <summary>
    /// All upgrade checkouts in one JSON file - small, since the documents themselves live in the
    /// wiki repo's branches. Same SemaphoreSlim-guarded read-modify-write and temp-file swap as
    /// JsonFileTalkingPointRepository.
    /// </summary>
    public sealed class JsonFileUpgradeCheckoutRepository : IUpgradeCheckoutRepository
    {
        private static readonly JsonSerializerOptions SerializerOptions = new()
        {
            WriteIndented = true,
            Converters = { new JsonStringEnumConverter() },
        };

        private readonly string _dataDirectory;
        private readonly SemaphoreSlim _gate = new(1, 1);

        public JsonFileUpgradeCheckoutRepository(IOptions<UpgradeDocumentationSettings> settings)
        {
            var configured = settings.Value.DataDirectory;
            _dataDirectory = Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        public async Task<IReadOnlyList<UpgradeCheckout>> GetAllAsync(CancellationToken ct = default)
            => (await ReadAsync(ct)).OrderByDescending(c => c.UpdatedAt).ToList();

        public async Task<UpgradeCheckout?> GetAsync(string id, CancellationToken ct = default)
            => (await ReadAsync(ct)).FirstOrDefault(c => c.Id == id);

        public async Task SaveAsync(UpgradeCheckout checkout, CancellationToken ct = default)
        {
            await _gate.WaitAsync(ct);
            try
            {
                var all = await ReadAsync(ct);
                all.RemoveAll(c => c.Id == checkout.Id);
                all.Add(checkout);
                await WriteAsync(all, ct);
            }
            finally
            {
                _gate.Release();
            }
        }

        private string FilePath => Path.Combine(_dataDirectory, "upgrade-checkouts.json");

        private async Task<List<UpgradeCheckout>> ReadAsync(CancellationToken ct)
        {
            if (!File.Exists(FilePath)) return new List<UpgradeCheckout>();
            await using var stream = File.OpenRead(FilePath);
            return await JsonSerializer.DeserializeAsync<List<UpgradeCheckout>>(stream, SerializerOptions, ct) ?? new List<UpgradeCheckout>();
        }

        private async Task WriteAsync(List<UpgradeCheckout> entries, CancellationToken ct)
        {
            Directory.CreateDirectory(_dataDirectory);
            var tempPath = FilePath + ".tmp";
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, entries, SerializerOptions, ct);
            }
            File.Move(tempPath, FilePath, overwrite: true);
        }
    }
}
