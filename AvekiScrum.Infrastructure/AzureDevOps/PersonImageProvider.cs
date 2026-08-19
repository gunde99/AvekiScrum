using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Configuration;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public sealed class PersonImageProvider : IPersonImageProvider
    {
        private const string GraphApiVersion = "7.1-preview.1";
        private const int GeneratedAzureAvatarMaximumBytes = 1024;
        private readonly HttpClient _httpClient;
        private readonly ILogger<PersonImageProvider> _logger;
        private readonly AzureSettings _azureSettings;
        private readonly string _imageRoot;
        private readonly IReadOnlyDictionary<string, string> _localImages;
        private readonly ConcurrentDictionary<string, Lazy<Task<PersonImageContent?>>>
            _cache = new(StringComparer.Ordinal);
        private readonly Lazy<Task<IReadOnlyList<GraphPerson>>> _graphPeople;

        public PersonImageProvider(
            HttpClient httpClient,
            IOptions<AzureSettings> azureSettings,
            IConfiguration configuration,
            ILogger<PersonImageProvider> logger)
        {
            _httpClient = httpClient;
            _azureSettings = azureSettings.Value;
            _logger = logger;

            var token = Convert.ToBase64String(
                Encoding.ASCII.GetBytes($":{_azureSettings.PAT}"));
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Basic", token);

            var configuredRoot =
                configuration["DashboardBranding:ImageRoot"]?.Trim()
                ?? "AvekiImages";
            _imageRoot = Path.GetFullPath(
                Path.Combine(AppContext.BaseDirectory, configuredRoot));
            _localImages = BuildLocalImageIndex(configuration);
            _graphPeople = new Lazy<Task<IReadOnlyList<GraphPerson>>>(
                LoadGraphPeopleAsync,
                LazyThreadSafetyMode.ExecutionAndPublication);
        }

        public async Task<PersonImageContent?> GetImageAsync(
            PersonImageRequest request,
            CancellationToken ct = default)
        {
            ArgumentNullException.ThrowIfNull(request);
            var normalizedRequest = request with
            {
                Size = Math.Clamp(request.Size, 24, 512)
            };
            var cacheKey = string.Join(
                "\n",
                normalizedRequest.AzureIdentityId,
                normalizedRequest.UserId,
                normalizedRequest.DisplayName,
                normalizedRequest.AzureImageUrl,
                normalizedRequest.LocalImagePath,
                normalizedRequest.Size.ToString(CultureInfo.InvariantCulture));
            var lazyResult = _cache.GetOrAdd(
                cacheKey,
                _ => new Lazy<Task<PersonImageContent?>>(
                    () => ResolveImageAsync(normalizedRequest),
                    LazyThreadSafetyMode.ExecutionAndPublication));

            try
            {
                return await lazyResult.Value.WaitAsync(ct);
            }
            catch
            {
                _cache.TryRemove(cacheKey, out _);
                throw;
            }
        }

        private async Task<PersonImageContent?> ResolveImageAsync(
            PersonImageRequest request)
        {
            var localPath = ResolveLocalImagePath(request);
            foreach (var azureUrl in await AzureImageCandidatesAsync(request))
            {
                try
                {
                    using var response = await _httpClient.GetAsync(azureUrl);
                    if (!response.IsSuccessStatusCode)
                        continue;

                    var bytes = await response.Content.ReadAsByteArrayAsync();
                    if (bytes.Length == 0)
                        continue;

                    var contentType =
                        response.Content.Headers.ContentType?.MediaType
                        ?? ContentTypeFromPath(azureUrl);
                    if (localPath != null &&
                        IsGeneratedAzureAvatar(bytes, contentType))
                    {
                        _logger.LogDebug(
                            "Azure returned a generated initials avatar for {Person}; using the local profile image.",
                            request.UserId ?? request.DisplayName ?? request.AzureIdentityId);
                        continue;
                    }

                    return ResizeAvatar(
                        bytes,
                        contentType,
                        request.Size,
                        PersonImageSource.Azure);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(
                        ex,
                        "Could not load Azure profile image for {Person}.",
                        request.UserId ?? request.DisplayName ?? request.AzureIdentityId);
                }
            }

            if (localPath == null)
                return null;

            try
            {
                return ResizeAvatar(
                    await File.ReadAllBytesAsync(localPath),
                    ContentTypeFromPath(localPath),
                    request.Size,
                    PersonImageSource.Local);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Could not load local profile image {ImagePath}.",
                    localPath);
                return null;
            }
        }

        private async Task<IReadOnlyList<string>> AzureImageCandidatesAsync(
            PersonImageRequest request)
        {
            var candidates = new List<string>();
            AddTrustedAzureUrl(candidates, request.AzureImageUrl);

            if (Guid.TryParse(request.AzureIdentityId, out var identityId))
            {
                AddTrustedAzureUrl(
                    candidates,
                    $"{OrganizationUrl()}/_api/_common/identityImage" +
                    $"?id={identityId:D}&size=2");
            }
            else if (!string.IsNullOrWhiteSpace(request.AzureIdentityId) &&
                     request.AzureIdentityId.Contains('.', StringComparison.Ordinal))
            {
                AddTrustedAzureUrl(
                    candidates,
                    $"{OrganizationUrl()}/_apis/GraphProfile/MemberAvatars/" +
                    $"{Uri.EscapeDataString(request.AzureIdentityId)}?size=2");
            }

            if (candidates.Count == 0 &&
                (!string.IsNullOrWhiteSpace(request.UserId) ||
                 !string.IsNullOrWhiteSpace(request.DisplayName)))
            {
                try
                {
                    var people = await _graphPeople.Value;
                    var graphPerson = FindGraphPerson(
                        people,
                        request.UserId,
                        request.DisplayName);
                    AddTrustedAzureUrl(candidates, graphPerson?.AvatarUrl);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(
                        ex,
                        "Could not resolve Azure identity for {Person}.",
                        request.UserId ?? request.DisplayName);
                }
            }

            return candidates.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        private async Task<IReadOnlyList<GraphPerson>> LoadGraphPeopleAsync()
        {
            var people = new List<GraphPerson>();
            string? continuationToken = null;

            do
            {
                var url =
                    $"https://vssps.dev.azure.com/" +
                    $"{Uri.EscapeDataString(_azureSettings.Organization)}" +
                    $"/_apis/graph/users?$top=1000&api-version={GraphApiVersion}";
                if (!string.IsNullOrWhiteSpace(continuationToken))
                    url += $"&continuationToken={Uri.EscapeDataString(continuationToken)}";

                using var response = await _httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();
                await using var stream = await response.Content.ReadAsStreamAsync();
                using var document = await JsonDocument.ParseAsync(stream);
                if (document.RootElement.TryGetProperty("value", out var values))
                {
                    foreach (var person in values.EnumerateArray())
                    {
                        people.Add(new GraphPerson(
                            Property(person, "principalName"),
                            Property(person, "mailAddress"),
                            Property(person, "displayName"),
                            NestedProperty(person, "_links", "avatar", "href")));
                    }
                }

                continuationToken = response.Headers.TryGetValues(
                    "X-MS-ContinuationToken",
                    out var tokens)
                    ? tokens.FirstOrDefault()
                    : null;
            }
            while (!string.IsNullOrWhiteSpace(continuationToken));

            return people;
        }

        private string? ResolveLocalImagePath(PersonImageRequest request)
        {
            var explicitPath = ResolveUnderImageRoot(request.LocalImagePath);
            if (explicitPath != null)
                return explicitPath;

            foreach (var key in CandidateKeys(request.UserId, request.DisplayName))
            {
                if (_localImages.TryGetValue(key, out var path))
                    return path;
            }

            return null;
        }

        private IReadOnlyDictionary<string, string> BuildLocalImageIndex(
            IConfiguration configuration)
        {
            var images = new Dictionary<string, string>(
                StringComparer.OrdinalIgnoreCase);
            if (Directory.Exists(_imageRoot))
            {
                foreach (var path in Directory.EnumerateFiles(
                             _imageRoot,
                             "*.*",
                             SearchOption.AllDirectories)
                         .Where(IsSupportedImage)
                         .Where(path => !IsBrandImage(path)))
                {
                    AddImageKeys(images, path, Path.GetFileNameWithoutExtension(path));
                }
            }

            foreach (var mapping in configuration
                         .GetSection("DashboardBranding:ImageByName")
                         .GetChildren())
            {
                var path = ResolveUnderImageRoot(mapping.Value);
                if (path != null)
                    AddImageKeys(images, path, mapping.Key);
            }

            foreach (var mapping in configuration
                         .GetSection("DashboardBranding:ImageByUserId")
                         .GetChildren())
            {
                var path = ResolveUnderImageRoot(mapping.Value);
                if (path == null)
                    continue;

                AddImageKeys(images, path, mapping.Key);
                var localPart = mapping.Key.Split('@')[0];
                var parts = localPart.Split(
                    new[] { '.', '_', '-' },
                    StringSplitOptions.RemoveEmptyEntries |
                    StringSplitOptions.TrimEntries);
                if (parts.Length >= 2)
                {
                    AddImageKeys(images, path, $"{parts[0]} {parts[^1]}");
                    AddImageKeys(images, path, $"{parts[0]} {parts[^1][0]}");
                }
            }

            return images;
        }

        private string? ResolveUnderImageRoot(string? configuredPath)
        {
            if (string.IsNullOrWhiteSpace(configuredPath))
                return null;

            var candidate = Path.IsPathRooted(configuredPath)
                ? Path.GetFullPath(configuredPath)
                : Path.GetFullPath(
                    Path.Combine(AppContext.BaseDirectory, configuredPath));
            var rootWithSeparator = _imageRoot.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            return candidate.StartsWith(
                       rootWithSeparator,
                       StringComparison.OrdinalIgnoreCase) &&
                   File.Exists(candidate) &&
                   IsSupportedImage(candidate)
                ? candidate
                : null;
        }

        private static GraphPerson? FindGraphPerson(
            IEnumerable<GraphPerson> people,
            string? userId,
            string? displayName)
        {
            if (!string.IsNullOrWhiteSpace(userId))
            {
                var byUserId = people.FirstOrDefault(person =>
                    string.Equals(
                        person.PrincipalName,
                        userId.Trim(),
                        StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(
                        person.MailAddress,
                        userId.Trim(),
                        StringComparison.OrdinalIgnoreCase));
                if (byUserId != null)
                    return byUserId;
            }

            if (string.IsNullOrWhiteSpace(displayName))
                return null;

            var normalizedName = NormalizeKey(displayName);
            return people.FirstOrDefault(person =>
                string.Equals(
                    NormalizeKey(person.DisplayName),
                    normalizedName,
                    StringComparison.Ordinal));
        }

        private static IEnumerable<string> CandidateKeys(
            string? userId,
            string? displayName)
        {
            var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            AddCandidate(keys, userId);
            AddCandidate(keys, displayName);

            if (!string.IsNullOrWhiteSpace(userId))
            {
                var localPart = userId.Split('@')[0];
                var parts = localPart.Split(
                    new[] { '.', '_', '-' },
                    StringSplitOptions.RemoveEmptyEntries |
                    StringSplitOptions.TrimEntries);
                if (parts.Length >= 2)
                {
                    AddCandidate(keys, $"{parts[0]} {parts[^1]}");
                    AddCandidate(keys, $"{parts[0]} {parts[^1][0]}");
                }
            }

            if (!string.IsNullOrWhiteSpace(displayName))
            {
                var parts = displayName.Split(
                    ' ',
                    StringSplitOptions.RemoveEmptyEntries |
                    StringSplitOptions.TrimEntries);
                if (parts.Length > 0)
                    AddCandidate(keys, parts[0]);
                if (parts.Length >= 2)
                    AddCandidate(keys, $"{parts[0]} {parts[^1][0]}");
            }

            return keys;
        }

        private static void AddImageKeys(
            IDictionary<string, string> images,
            string path,
            string rawKey)
        {
            AddImageKey(images, path, rawKey);
            var withoutSuffix = rawKey
                .Replace("_sv", "", StringComparison.OrdinalIgnoreCase)
                .Replace(" svvit mörkare", "", StringComparison.OrdinalIgnoreCase)
                .Replace(" mörkare", "", StringComparison.OrdinalIgnoreCase)
                .Trim();
            AddImageKey(images, path, withoutSuffix);
        }

        private static void AddImageKey(
            IDictionary<string, string> images,
            string path,
            string? key)
        {
            if (string.IsNullOrWhiteSpace(key))
                return;

            images[key.Trim()] = path;
            images[NormalizeKey(key)] = path;
        }

        private static void AddCandidate(ISet<string> keys, string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return;

            keys.Add(value.Trim());
            keys.Add(NormalizeKey(value));
        }

        private static string NormalizeKey(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            var normalized = value.Normalize(NormalizationForm.FormD);
            var builder = new StringBuilder(normalized.Length);
            foreach (var ch in normalized)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) ==
                    UnicodeCategory.NonSpacingMark)
                    continue;
                if (char.IsLetterOrDigit(ch))
                    builder.Append(char.ToLowerInvariant(ch));
            }

            return builder.ToString();
        }

        private static PersonImageContent ResizeAvatar(
            byte[] bytes,
            string contentType,
            int size,
            PersonImageSource source)
        {
            try
            {
                using var input = new MemoryStream(bytes);
                using var original = Image.FromStream(input);
                using var avatar = new Bitmap(size, size, PixelFormat.Format24bppRgb);
                using var graphics = Graphics.FromImage(avatar);
                graphics.Clear(Color.White);
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                var cropSize = Math.Min(original.Width, original.Height);
                var sourceRectangle = new Rectangle(
                    (original.Width - cropSize) / 2,
                    (original.Height - cropSize) / 2,
                    cropSize,
                    cropSize);
                graphics.DrawImage(
                    original,
                    new Rectangle(0, 0, size, size),
                    sourceRectangle,
                    GraphicsUnit.Pixel);

                using var output = new MemoryStream();
                var jpegEncoder = ImageCodecInfo.GetImageEncoders()
                    .First(encoder => encoder.FormatID == ImageFormat.Jpeg.Guid);
                using var parameters = new EncoderParameters(1);
                parameters.Param[0] = new EncoderParameter(
                    System.Drawing.Imaging.Encoder.Quality,
                    88L);
                avatar.Save(output, jpegEncoder, parameters);
                return new PersonImageContent(
                    output.ToArray(),
                    "image/jpeg",
                    source);
            }
            catch
            {
                return new PersonImageContent(bytes, contentType, source);
            }
        }

        private string OrganizationUrl()
            => $"{_azureSettings.BaseUrl.TrimEnd('/')}/" +
               Uri.EscapeDataString(_azureSettings.Organization);

        private static void AddTrustedAzureUrl(
            ICollection<string> candidates,
            string? url)
        {
            if (Uri.TryCreate(url, UriKind.Absolute, out var absolute) &&
                absolute.Scheme == Uri.UriSchemeHttps &&
                IsTrustedAzureHost(absolute.Host))
                candidates.Add(absolute.ToString());
        }

        private static bool IsTrustedAzureHost(string host)
            => host.Equals("dev.azure.com", StringComparison.OrdinalIgnoreCase) ||
               host.Equals("vssps.dev.azure.com", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".dev.azure.com", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".visualstudio.com", StringComparison.OrdinalIgnoreCase);

        private static bool IsGeneratedAzureAvatar(
            byte[] bytes,
            string? contentType)
        {
            if (contentType?.StartsWith(
                    "image/",
                    StringComparison.OrdinalIgnoreCase) != true)
                return false;

            if (bytes.Length <= GeneratedAzureAvatarMaximumBytes)
                return true;

            if (contentType.Equals(
                    "image/svg+xml",
                    StringComparison.OrdinalIgnoreCase))
            {
                var svg = Encoding.UTF8.GetString(bytes);
                return svg.Contains("<text", StringComparison.OrdinalIgnoreCase) ||
                       svg.Contains("font-family", StringComparison.OrdinalIgnoreCase) ||
                       svg.Contains("initial", StringComparison.OrdinalIgnoreCase);
            }

            try
            {
                using var stream = new MemoryStream(bytes, writable: false);
                using var image = Image.FromStream(stream);
                using var bitmap = new Bitmap(image);
                var xStep = Math.Max(1, bitmap.Width / 96);
                var yStep = Math.Max(1, bitmap.Height / 96);
                var colors = new Dictionary<int, int>();
                var sampledPixels = 0;

                for (var y = 0; y < bitmap.Height; y += yStep)
                {
                    for (var x = 0; x < bitmap.Width; x += xStep)
                    {
                        var color = bitmap.GetPixel(x, y);
                        if (color.A < 24)
                            continue;

                        // Generated initials consist of a background, a ring and
                        // text. Quantization removes anti-aliasing shades while a
                        // photograph still retains a considerably richer palette.
                        var bucket = ((color.R >> 5) << 6) |
                                     ((color.G >> 5) << 3) |
                                     (color.B >> 5);
                        colors[bucket] = colors.TryGetValue(bucket, out var count)
                            ? count + 1
                            : 1;
                        sampledPixels++;
                    }
                }

                if (sampledPixels < 64)
                    return false;

                var dominantRatio = colors.Values
                    .OrderByDescending(count => count)
                    .Take(4)
                    .Sum() / (double)sampledPixels;
                return colors.Count <= 24 ||
                       (colors.Count <= 64 && dominantRatio >= 0.82d);
            }
            catch
            {
                return false;
            }
        }

        private static string? Property(
            JsonElement element,
            string propertyName)
            => element.TryGetProperty(propertyName, out var property) &&
               property.ValueKind == JsonValueKind.String
                ? property.GetString()
                : null;

        private static string? NestedProperty(
            JsonElement element,
            params string[] propertyNames)
        {
            var current = element;
            foreach (var propertyName in propertyNames)
            {
                if (!current.TryGetProperty(propertyName, out current))
                    return null;
            }

            return current.ValueKind == JsonValueKind.String
                ? current.GetString()
                : null;
        }

        private static bool IsSupportedImage(string path)
            => Path.GetExtension(path).ToLowerInvariant()
                is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif";

        private static bool IsBrandImage(string path)
            => Path.GetFileName(path).ToLowerInvariant()
                is "aveki.png" or "logga.png";

        private static string ContentTypeFromPath(string path)
            => Path.GetExtension(path.Split('?', '#')[0]).ToLowerInvariant() switch
            {
                ".gif" => "image/gif",
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "image/jpeg"
            };

        private sealed record GraphPerson(
            string? PrincipalName,
            string? MailAddress,
            string? DisplayName,
            string? AvatarUrl);
    }
}
