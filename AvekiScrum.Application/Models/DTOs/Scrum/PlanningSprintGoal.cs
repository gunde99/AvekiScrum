using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    /// <summary>
    /// Ett sprintmål som kan initiera planeringsboarden oberoende av
    /// var målet kommer ifrån, exempelvis C#-kod eller Azure DevOps Wiki.
    /// </summary>
    public sealed record PlanningSprintGoal(
        string Id,
        int Number,
        string Title,
        string Description = "",
        IReadOnlyCollection<string>? Owners = null,
        string Expert = "",
        IReadOnlyCollection<PlanningGoalDeliverable>? Deliverables = null,
        IReadOnlyCollection<PlanningGoalDoneCriterion>? DefinitionOfDone = null,
        IReadOnlyCollection<int>? WorkItemIds = null,
        IReadOnlyCollection<PlanningSprintSubGoal>? SubGoals = null);

    /// <summary>
    /// Ett delmål under Team Nords Epic/sprintmål. Prioriteten är intern för
    /// delmålet och är därför skild från sprintmålets nummer.
    /// </summary>
    public sealed record PlanningSprintSubGoal(
        string Id,
        string Title,
        string Description = "",
        int? Priority = null,
        IReadOnlyCollection<int>? WorkItemIds = null);

    public sealed record PlanningGoalDeliverable(
        string Id,
        string Text,
        int? Priority = null,
        bool Done = false);

    public sealed record PlanningGoalDoneCriterion(
        string Id,
        string Text,
        bool Checked = false);
}
