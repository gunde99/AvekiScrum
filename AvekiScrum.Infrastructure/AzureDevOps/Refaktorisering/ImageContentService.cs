using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Configuration;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal sealed class ImageContentService : IImageContentService
    {
        private readonly HttpClient _http;
        private readonly ILogger<ImageContentService> _logger;

        public ImageContentService(
            HttpClient http,
            IOptions<AzureSettings> options,
            ILogger<ImageContentService> logger)
        {
            _http = http;
            _logger = logger;

            var settings = options.Value;

            // Auth sätts per request av AzureDevOpsAuthHandler.

            // Vi förväntar oss bilder
            _http.DefaultRequestHeaders.Accept.Clear();
            _http.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("image/*"));

            // BaseAddress är valfri; avatar-URL:er brukar vara absoluta
            // men det skadar inte att ha org-basen:
            // _http.BaseAddress = new Uri($"{settings.BaseUrl}/{settings.Organization}/");
        }

        public async Task<byte[]> GetImageBytesAsync(string url, CancellationToken ct = default)
        {
            using var resp = await _http.GetAsync(url, ct);
            resp.EnsureSuccessStatusCode();
            return await resp.Content.ReadAsByteArrayAsync(ct);
        }

        public async Task<Image> LoadImageFromUrlAsync(string url, CancellationToken ct = default)
        {
            var bytes = await GetImageBytesAsync(url, ct);
            using var ms = new MemoryStream(bytes);
            return Image.FromStream(ms);
        }
    }
}
