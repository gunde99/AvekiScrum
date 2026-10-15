using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Upgrade;

namespace AvekiScrum.Application.Abstractions.Repositories
{
    public interface IUpgradeCheckoutRepository
    {
        Task<IReadOnlyList<UpgradeCheckout>> GetAllAsync(CancellationToken ct = default);

        Task<UpgradeCheckout?> GetAsync(string id, CancellationToken ct = default);

        /// <summary>Inserts or replaces by Id.</summary>
        Task SaveAsync(UpgradeCheckout checkout, CancellationToken ct = default);
    }
}
