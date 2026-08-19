using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public interface IAzureDevOpsTestPlansClient
    {
        Task<TestPlanProgressDto> GetTestPlanProgressAsync(string sheetId, int planId, int suiteId, CancellationToken ct = default);
        Task<TestPlanProgressDto> GetTestPlanProgressBySuiteNameAsync(string sheetId, int planId, string suiteName, CancellationToken ct = default);
    }
}
