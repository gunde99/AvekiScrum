using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Configuration;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    internal interface IAzureDevOpsRestClient
    {
        Task<RestResponse> GetAsync(string url, CancellationToken ct = default);
        Task<string> GetStringAsync(string url, CancellationToken ct = default);
        Task<T?> GetJsonAsync<T>(string url, CancellationToken ct = default);
        Task<string> PostJsonAsync<T>(string url, T body, CancellationToken ct = default);
        Task<TResponse?> PostJsonAsync<TRequest, TResponse>(string url, TRequest body, CancellationToken ct = default);
        Task<RestResponse> PatchJsonPatchAsync<T>(string url, T body, CancellationToken ct = default);
        Task<RestResponse> PostJsonPatchAsync<T>(string url, T body, CancellationToken ct = default);
        Task<RestResponse> PutJsonAsync<T>(string url, T body, string ifMatchVersion = null, CancellationToken ct = default);
        Task<bool> DeleteAsync(string url, string ifMatchVersion = null, CancellationToken ct = default);
        Task<(byte[] Bytes, string ContentType)> GetBytesAsync(string url, CancellationToken ct = default);
        Task<string> PostBinaryAsync(string url, byte[] bytes, string contentType, CancellationToken ct = default);
    }

    internal sealed class RestResponse
    {
        public string Body { get; init; } = "";
        public string ETag { get; init; }
        public string ContinuationToken { get; init; } = "";
        public int StatusCode { get; init; }
    }

    internal sealed class AzureDevOpsRestClient : IAzureDevOpsRestClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<AzureDevOpsRestClient> _logger;

        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = true
        };

        public AzureDevOpsRestClient(
            HttpClient httpClient,
            ILogger<AzureDevOpsRestClient> logger,
            IOptions<AzureSettings> options)
        {
            _httpClient = httpClient;
            _logger = logger;

            var settings = options.Value;

            // Bas mot organisation, resten sköts av AzureUrlHelper
            _httpClient.BaseAddress = new Uri($"{settings.BaseUrl}");

            // No Authorization header here: AzureDevOpsAuthHandler sets it per request, because
            // with delegated auth the credential belongs to the signed-in user rather than to the
            // client instance.

            _httpClient.DefaultRequestHeaders.Accept.Clear();
            _httpClient.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public async Task<string> GetStringAsync(string url, CancellationToken ct = default)
        {
            //using var resp = await _httpClient.GetAsync(url, ct);

            //if (!resp.IsSuccessStatusCode)
            //{
            //    var body = await resp.Content.ReadAsStringAsync(ct);
            //    _logger.LogError("GET {Url} failed: {Status} {Reason} {Body}",
            //        url, (int)resp.StatusCode, resp.ReasonPhrase, body);

            //    throw new HttpRequestException(
            //        $"GET {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}");
            //}

            //return await resp.Content.ReadAsStringAsync(ct);

            return (await GetAsync(url, ct)).Body;
        }

        public async Task<T?> GetJsonAsync<T>(string url, CancellationToken ct = default)
        {
            var json = await GetStringAsync(url, ct);
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }

        public async Task<string> PostJsonAsync<T>(string url, T body, CancellationToken ct = default)
        {
            using var resp = await _httpClient.PostAsJsonAsync<T>(url, body, JsonOptions, ct);

            if (!resp.IsSuccessStatusCode)
            {
                var payload = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogError("POST {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);

                throw new HttpRequestException(
                    $"POST {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}");
            }

            return await resp.Content.ReadAsStringAsync(ct);
        }

        public async Task<TResponse?> PostJsonAsync<TRequest, TResponse>(
            string url,
            TRequest body,
            CancellationToken ct = default)
        {
            var json = await PostJsonAsync(url, body, ct);
            return JsonSerializer.Deserialize<TResponse>(json, JsonOptions);
        }

        public async Task<string> PutJsonRawAsync(string url, string json, int? ifMatchVersion = null, CancellationToken ct = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Put, url)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            if (ifMatchVersion.HasValue)
                request.Headers.IfMatch.Add(new EntityTagHeaderValue($"\"{ifMatchVersion.Value}\""));

            using var resp = await _httpClient.SendAsync(request, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var payload = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogError("PUT {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);
                throw new HttpRequestException($"PUT {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}. Body: {payload}");
            }
            return await resp.Content.ReadAsStringAsync(ct);
        }

        public async Task<RestResponse> PutJsonAsync<T>(string url, T body, string ifMatchETag = null, CancellationToken ct = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Put, url)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(body, JsonOptions),
                    Encoding.UTF8,
                    "application/json")
            };

            if (!string.IsNullOrWhiteSpace(ifMatchETag))
            {
                request.Headers.IfMatch.Add(
                    new EntityTagHeaderValue($"\"{ifMatchETag.Trim('"')}\""));
            }

            using var resp = await _httpClient.SendAsync(request, ct);
            var payload = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("PUT {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);

                throw new HttpRequestException(
                    $"PUT {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}. Body: {payload}");
            }

            return new RestResponse
            {
                Body = payload,
                ETag = resp.Headers.ETag?.Tag?.Trim('"'),
                StatusCode = (int)resp.StatusCode
            };
        }    //=> PutJsonRawAsync(url, JsonSerializer.Serialize(body, JsonOptions), ifMatchVersion, ct);

        public async Task<RestResponse> PatchJsonPatchAsync<T>(string url, T body, CancellationToken ct = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Patch, url)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(body, JsonOptions),
                    Encoding.UTF8,
                    "application/json-patch+json")
            };

            using var resp = await _httpClient.SendAsync(request, ct);
            var payload = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("PATCH {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);

                throw new HttpRequestException(
                    $"PATCH {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}. Body: {payload}");
            }

            return new RestResponse
            {
                Body = payload,
                ETag = resp.Headers.ETag?.Tag?.Trim('"'),
                StatusCode = (int)resp.StatusCode
            };
        }

        public async Task<RestResponse> PostJsonPatchAsync<T>(string url, T body, CancellationToken ct = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(body, JsonOptions),
                    Encoding.UTF8,
                    "application/json-patch+json")
            };

            using var resp = await _httpClient.SendAsync(request, ct);
            var payload = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("POST {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);

                throw new HttpRequestException(
                    $"POST {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}. Body: {payload}");
            }

            return new RestResponse
            {
                Body = payload,
                ETag = resp.Headers.ETag?.Tag?.Trim('"'),
                StatusCode = (int)resp.StatusCode
            };
        }

        public async Task<bool> DeleteAsync(string url, string? ifMatchETag = null, CancellationToken ct = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Delete, url);

            if (!string.IsNullOrWhiteSpace(ifMatchETag))
            {
                request.Headers.IfMatch.Add(
                    new EntityTagHeaderValue($"\"{ifMatchETag.Trim('"')}\""));
            }

            using var resp = await _httpClient.SendAsync(request, ct);
            var payload = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("DELETE {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);
                return false;
            }

            return true;
        }

        public async Task<(byte[] Bytes, string ContentType)> GetBytesAsync(string url, CancellationToken ct = default)
        {
            using var resp = await _httpClient.GetAsync(url, ct);
            var bytes = await resp.Content.ReadAsByteArrayAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("GET {Url} failed: {Status} {Reason}", url, (int)resp.StatusCode, resp.ReasonPhrase);
                throw new HttpRequestException($"GET {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}");
            }

            return (bytes, resp.Content.Headers.ContentType?.MediaType ?? "application/octet-stream");
        }

        public async Task<string> PostBinaryAsync(string url, byte[] bytes, string contentType, CancellationToken ct = default)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new ByteArrayContent(bytes)
            };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue(
                string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType);

            using var resp = await _httpClient.SendAsync(request, ct);
            var payload = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("POST {Url} failed: {Status} {Reason} {Payload}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, payload);
                throw new HttpRequestException(
                    $"POST {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}. Body: {payload}");
            }

            return payload;
        }

        public async Task<RestResponse> GetAsync(string url, CancellationToken ct = default)
        {
            using var resp = await _httpClient.GetAsync(url, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("GET {Url} failed: {Status} {Reason} {Body}",
                    url, (int)resp.StatusCode, resp.ReasonPhrase, body);

                throw new HttpRequestException(
                    $"GET {url} failed with {(int)resp.StatusCode} {resp.ReasonPhrase}. Body: {body}");
            }

            return new RestResponse
            {
                Body = body,
                ETag = resp.Headers.ETag?.Tag?.Trim('"'),
                ContinuationToken = resp.Headers.TryGetValues("x-ms-continuationtoken", out var values)
                    ? values.FirstOrDefault() ?? ""
                    : "",
                StatusCode = (int)resp.StatusCode
            };
        }
    }
}
