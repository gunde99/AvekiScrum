using System.Drawing;
using System.Threading;
using System.Threading.Tasks;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public interface IImageContentService
    {
        Task<byte[]> GetImageBytesAsync(string url, CancellationToken ct = default);
        Task<Image> LoadImageFromUrlAsync(string url, CancellationToken ct = default);
    }
}
