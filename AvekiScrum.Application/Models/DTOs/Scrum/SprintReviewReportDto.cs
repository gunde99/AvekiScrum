// Application/SprintReview/Dto/SprintReviewReportDto.cs
using System.Collections.Generic;
namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public sealed class SprintReviewReportDto
    {
        public string ExportFolder { get; init; }
        public string ReleaseName { get; init; }      // t.ex. "26.1"
        public string ReviewDate { get; init; }       // t.ex. "2023-02-15"
        public string TeamName { get; init; }        // t.ex. "Team Nord"
        public string SprintName { get; set; }        // t.ex. "Sprint 5"
        public string AzureDevOpsBaseUrl { get; init; }

        public IReadOnlyList<SprintReviewDemoDeveloperDto> DemoDevelopers { get; init; }
        public IReadOnlyList<SprintReviewBugDto> CustomerClosedBugs { get; init; }
        public IReadOnlyList<SprintReviewBugDto> CustomerResolvedBugs { get; init; }
        public IReadOnlyList<SprintReviewBugDto> InternalClosedBugs { get; init; }
        public IReadOnlyList<SprintReviewBugDto> InternalResolvedBugs { get; init; }
    }

    public sealed class SprintReviewDemoDeveloperDto
    {
        public string DeveloperName { get; init; }
        public IReadOnlyList<SprintReviewDemoItemDto> Items { get; init; }
    }

    public sealed class SprintReviewDemoItemDto
    {
        public int? WorkItemId { get; init; }         // frivilligt att visa
        public string Title { get; init; }
        public string Label { get; init; }            // "[Demo]" / "[Bonusdemo]" etc
    }

    public sealed class SprintReviewBugDto
    {
        public int WorkItemId { get; init; }
        public string Title { get; init; }
    }
}
