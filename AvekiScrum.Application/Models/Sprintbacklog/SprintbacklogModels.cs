using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using AvekiScrum.Application.Models.DTOs;


namespace AvekiScrum.Application.Models.Sprintbacklog
{
    /// <summary>
    /// Motsvarar de olika Kanban–stadier en DeveloperTask kan befinna sig i.
    /// </summary>
    public enum TaskStage
    {
        New,            //New DeveloperTask
        Active,         //Active DeveloperTask
        Resolved,       //Resolved DeveloperTask
        CodeReview,     //Code Review (Separate workflow)
        Test,           //Test Task (Separate workflow)
        Documentation,  //Documentation Task (Separate workflow)
        Done,           //Everything is finished
        None
    }

    /// <summary>
    /// Komplement till TaskStage, representerar den momentana statusen för en DeveloperTask
    /// för stadierna CodereReview, Test och Documentation.
    /// </summary>
    public enum FlowStatus
    {
        New,
        Active,
        NotOk,  //Failed Test or Review
        Closed
    }

    /// <summary>
    /// Motsvarar de olika stadier en UserStory kan befinna sig i.
    /// En Story representeras i mainrow i gridden och dess stage härleds från dess tasks.
    /// </summary>
    public enum StoryStage
    {
        New = 0,
        Development = 1,
        CodeReview = 2,
        Testing = 3,
        Documentation = 4,
        Done = 5
    }

    public enum BlockerLevel
    {
        None = 0,
        Risk = 1,
        Blocked = 2
    }

    public enum AlertLevel  //Tänkt att ersätta BlockerLevel
    {
        None = 0,

        // Nivå 1: “uppmärksamhet”, t.ex. börjar dra över soft-threshold
        Notice = 1,

        // Nivå 2: “varning”, t.ex. tydligt över tröskel eller NotOk finns
        Warning = 2,

        // Nivå 3: “kritisk”, t.ex. missat viktigt gate, extrem ålder, upprepade fail
        Critical = 3
    }

    public enum FlowCardType
    {
        WorkItem,
        PullRequest
    }

    public class TaskVm
    {
        public int Id { get; set; }
        public string Key { get; set; } = "";
        public int StoryId { get; set; }
        public string Title { get; set; } = "";
        public TaskStage Stage { get; set; }
        public FlowStatus Status { get; set; }
        public string AssignedTo { get; set; } = "";
        public string Activity { get; set; } = "";
        public bool IsBlocked { get; set; }
        public List<string> Tags { get; set; } = new();

        public bool IsPlaceholder { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime? CompletedDate { get; set; }
        public DateTime? StatusChangedDate { get; set; }
        public List<PullRequestCardVm> PullRequests { get; set; } = new();
    }

    public class PullRequestCardVm
    {
        public int PullRequestId { get; set; }
        public Guid RepoId { get; set; }
        public int StoryId { get; set; }
        public int? SourceTaskId { get; set; }
        public string Title { get; set; } = "";
        public string Status { get; set; } = "";
        public string WebUrl { get; set; } = "";
        public DateTime? CreatedDate { get; set; }
        public string CreatedBy { get; set; } = "";
        public string CreatedByUniqueName { get; set; } = "";

        public bool IsCompleted =>
            string.Equals(Status, "Completed", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(Status, "Complete", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(Status, "Merged", StringComparison.OrdinalIgnoreCase);

        public bool IsAbandoned =>
            string.Equals(Status, "Abandoned", StringComparison.OrdinalIgnoreCase);

        public FlowStatus FlowStatus =>
            IsCompleted ? FlowStatus.Closed :
            IsAbandoned ? FlowStatus.NotOk :
            FlowStatus.Active;

        public static PullRequestCardVm FromSimple(PullRequestSimpleDto pr, int storyId, int? sourceTaskId = null)
        {
            if (pr == null) throw new ArgumentNullException(nameof(pr));

            return new PullRequestCardVm
            {
                PullRequestId = pr.PullRequestId,
                RepoId = pr.RepoId,
                StoryId = storyId,
                SourceTaskId = sourceTaskId,
                Title = pr.Title ?? "",
                Status = pr.Status ?? "",
                WebUrl = pr.WebUrl ?? "",
                CreatedDate = pr.CreatedDate,
                CreatedBy = pr.CreatedBy ?? "",
                CreatedByUniqueName = pr.CreatedByUniqueName ?? ""
            };
        }
    }

    public class FlowCardVm
    {
        public int Id { get; set; }
        public string Key { get; set; } = "";
        public int StoryId { get; set; }
        public int? SourceTaskId { get; set; }
        public string Title { get; set; } = "";
        public TaskStage Stage { get; set; }
        public FlowStatus Status { get; set; }
        public string StatusText { get; set; } = "";
        public string AssignedTo { get; set; } = "";
        public bool IsPlaceholder { get; set; }
        public FlowCardType CardType { get; set; }
        public string WebUrl { get; set; } = "";
        public DateTime CreatedDate { get; set; }
        public DateTime? CompletedDate { get; set; }
        public DateTime? StatusChangedDate { get; set; }
        public bool IsCompleted => Status == FlowStatus.Closed || Stage == TaskStage.Done;
        public string DisplayKey =>
            CardType == FlowCardType.PullRequest
                ? $"PR {Id}"
                : string.IsNullOrWhiteSpace(Key) ? Id.ToString() : Key;
        public string AssignedToText => string.IsNullOrWhiteSpace(AssignedTo) ? "-" : AssignedTo;
        public string SourceTaskText => SourceTaskId.HasValue ? SourceTaskId.Value.ToString() : "-";
        public string CreatedDateText => CreatedDate == DateTime.MinValue ? "-" : CreatedDate.ToString("yyyy-MM-dd");
        public string CompletedDateText => CompletedDate.HasValue ? CompletedDate.Value.ToString("yyyy-MM-dd") : "-";
        public string CardTypeText => CardType == FlowCardType.PullRequest ? "Pull Request" : "Task";
        public string DoneText => IsCompleted ? "Done" : StatusText;

        public static FlowCardVm FromTask(TaskVm task)
        {
            if (task == null) throw new ArgumentNullException(nameof(task));

            return new FlowCardVm
            {
                Id = task.Id,
                Key = string.IsNullOrWhiteSpace(task.Key) ? task.Id.ToString() : task.Key,
                StoryId = task.StoryId,
                SourceTaskId = task.Id,
                Title = task.Title,
                Stage = task.Stage,
                Status = task.Status,
                StatusText = task.Status.ToString(),
                AssignedTo = task.AssignedTo,
                IsPlaceholder = task.IsPlaceholder,
                CardType = FlowCardType.WorkItem,
                CreatedDate = task.CreatedDate,
                CompletedDate = task.CompletedDate,
                StatusChangedDate = task.StatusChangedDate
            };
        }

        public static FlowCardVm FromPullRequest(PullRequestCardVm pullRequest, TaskVm? sourceTask = null)
        {
            if (pullRequest == null) throw new ArgumentNullException(nameof(pullRequest));

            return new FlowCardVm
            {
                Id = pullRequest.PullRequestId,
                Key = $"PR {pullRequest.PullRequestId}",
                StoryId = pullRequest.StoryId,
                SourceTaskId = pullRequest.SourceTaskId,
                Title = string.IsNullOrWhiteSpace(pullRequest.Title)
                    ? $"Pull request {pullRequest.PullRequestId}"
                    : pullRequest.Title,
                Stage = TaskStage.CodeReview,
                Status = pullRequest.FlowStatus,
                StatusText = string.IsNullOrWhiteSpace(pullRequest.Status)
                    ? pullRequest.FlowStatus.ToString()
                    : pullRequest.Status,
                AssignedTo = sourceTask?.AssignedTo ?? "",
                CardType = FlowCardType.PullRequest,
                WebUrl = pullRequest.WebUrl,
                CreatedDate = pullRequest.CreatedDate ?? sourceTask?.CreatedDate ?? DateTime.MinValue,
                CompletedDate = pullRequest.IsCompleted ? pullRequest.CreatedDate : null,
                StatusChangedDate = pullRequest.CreatedDate
            };
        }
    }

    public class StoryVm
    {
        public int Id { get; set; }
        public string Key { get; set; } = "";
        public string Title { get; set; } = "";
        public string Developer { get; set; } = "";
        public string SprintGoal { get; set; } = "";
        public int? StoryPoints { get; set; }
        public StoryStage Stage { get; set; }
        public IEnumerable<string> Tags { get; set; } = new List<string>();
        public DateTime CreatedDate { get; set; }
        public DateTime? CompletedDate { get; set; }

        // RelationName = "Tasks"
        public BindingList<TaskVm> Tasks { get; set; } = new();
        public BindingList<PullRequestCardVm> PullRequests { get; set; } = new();
        public BindingList<FlowCardVm> FlowCards { get; set; } = new();

        // Collapsed counts per column
        public int TaskCount => Tasks?.Count ?? 0;
        public int ToDoCount => Tasks?.Count(t => t.Stage == TaskStage.New) ?? 0;
        public int DoingCount => Tasks?.Count(t => t.Stage == TaskStage.Active) ?? 0;

        private int TaskDoneCount => Tasks?.Count(IsTaskCompletedForProgress) ?? 0;
        private int PullRequestsDoneCount => PullRequests?.Count(pr => pr.IsCompleted) ?? 0;
        public int DoneCount => TaskDoneCount + PullRequestsDoneCount;

        public int DonePercentage
        {
            get
            {
                if (ProgressItemCount == 0) return 0;
                return (int)Math.Round((double)(DoneCount * 100) / ProgressItemCount);
            }
        }

        public int ProgressItemCount => TaskCount + (PullRequests?.Count ?? 0);
        public int PRsCount => PullRequests?.Count ?? 0;
        public int TestsCount => Tasks?.Count(t => t.Stage == TaskStage.Test) ?? 0;
        public int DocumentationCount => Tasks?.Count(t => t.Stage == TaskStage.Documentation) ?? 0;


        // Alerting
        public AlertLevel AlertLevel { get; set; } = AlertLevel.None;
        public string AlertSummary { get; set; } = "";             // bra för tooltip title
        public List<string> AlertDetails { get; set; } = new();    // tooltip body

        public string TasksSummary =>
            $"Total: {TaskCount}, To Do: {ToDoCount}, Doing: {DoingCount}, Done: {DoneCount}, PRs: {PRsCount}, Tests: {TestsCount}, Docs: {DocumentationCount}";

        private static bool IsTaskCompletedForProgress(TaskVm task) =>
            task.Stage == TaskStage.Done ||
            task.Status == FlowStatus.Closed ||
            task.CompletedDate.HasValue;

        public void RefreshFlowCards()
        {
            FlowCards.Clear();

            foreach (var task in Tasks ?? new BindingList<TaskVm>())
                FlowCards.Add(FlowCardVm.FromTask(task));

            foreach (var pullRequest in PullRequests ?? new BindingList<PullRequestCardVm>())
            {
                var sourceTask = pullRequest.SourceTaskId.HasValue
                    ? Tasks?.FirstOrDefault(t => t.Id == pullRequest.SourceTaskId.Value)
                    : null;

                FlowCards.Add(FlowCardVm.FromPullRequest(pullRequest, sourceTask));
            }
        }

        public string StoryStatus
        {
            get
            {
                if (CompletedDate.HasValue)
                    return "Completed";
                if (Tasks != null && Tasks.Any((Func<TaskVm, bool>)(t => t.Stage == TaskStage.Active || t.Stage == TaskStage.CodeReview || t.Stage == TaskStage.Test || t.Stage == TaskStage.Documentation)))
                    return "In Progress";
                if (Tasks != null && Tasks.Any(t => t.Stage == TaskStage.New))
                    return "New";
                return "No Tasks";
            }
        }

        // UI-projection för TokenEdit (string)
        public string TagsText
        {
            get => Tags == null ? "" : string.Join(";", Tags); // ingen " ; "
            set
            {
                Tags = string.IsNullOrWhiteSpace(value)
                    ? new List<string>()
                    : value.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries)
                           .Select(t => t.Trim())
                           .Where(t => t.Length > 0)
                           .Distinct(StringComparer.OrdinalIgnoreCase)
                           .ToList();
            }
        }
    }
}
