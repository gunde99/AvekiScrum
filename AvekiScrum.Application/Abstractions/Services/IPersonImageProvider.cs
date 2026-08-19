using System.Threading;
using System.Threading.Tasks;

namespace AvekiScrum.Application.Abstractions.Services
{
    /// <summary>
    /// Resolves a person's profile image from Azure DevOps first and from the
    /// application's local employee image library as fallback. Azure-generated
    /// initials are treated as a missing profile photo when a local image exists.
    /// </summary>
    public interface IPersonImageProvider
    {
        Task<PersonImageContent?> GetImageAsync(
            PersonImageRequest request,
            CancellationToken ct = default);
    }

    public sealed record PersonImageRequest(
        string? AzureIdentityId = null,
        string? UserId = null,
        string? DisplayName = null,
        string? AzureImageUrl = null,
        string? LocalImagePath = null,
        int Size = 96);

    public sealed record PersonImageContent(
        byte[] Bytes,
        string ContentType,
        PersonImageSource Source);

    public enum PersonImageSource
    {
        Azure,
        Local
    }
}
