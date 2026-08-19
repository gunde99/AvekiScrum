using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Application.Models.Enums;
using AvekiScrum.Application.Models.Sprintbacklog;

namespace AvekiScrum.Application.Mappers
{
    public class SprintBacklogMapper
    {
        public sealed record MapOptions(
        Func<WorkItemDto, int?> ParentIdSelector,
        Func<WorkItemDto, string?> KeySelector,
        Func<WorkItemDto, string?> SprintGoalSelector,
        Func<WorkItemDto, string?> StageHintSelector,
        bool IncludeBugsAsStories = true,
        bool CreatePlaceholderTasksForOrphans = true,
        bool UseResolvedDateAsCompletedIfClosedMissing = true
    )
        {
            public static MapOptions Default(Func<WorkItemDto, int?> parentIdSelector) =>
                new(
                    ParentIdSelector: parentIdSelector,
                    KeySelector: wi => wi.Id.ToString(CultureInfo.InvariantCulture),
                    SprintGoalSelector: wi => SprintGoalTagParser.GetSprintGoals(wi.Tags),
                    StageHintSelector: wi => wi.TagsTextOrNull()
                );
        }

        /// <summary>
        /// Mappar backlog -> StoryVm (med Tasks).
        /// Parent/child koppling sker via options.ParentIdSelector (t.ex System.Parent).
        /// </summary>
        public static BindingList<StoryVm> MapToStories(
            IReadOnlyList<WorkItemDto> sprintbacklog,
            MapOptions options,
            DateTime? nowUtc = null)
        {
            if (sprintbacklog == null) throw new ArgumentNullException(nameof(sprintbacklog));
            if (options == null) throw new ArgumentNullException(nameof(options));

            var now = nowUtc ?? DateTime.UtcNow;

            // 1) Separera stories och tasks
            var stories = sprintbacklog
                .Where(w => w.TypeEnum == WorkItemType.UserStory || (options.IncludeBugsAsStories && w.TypeEnum == WorkItemType.Bug))
                .ToList();

            var tasks = sprintbacklog
                .Where(w => w.TypeEnum == WorkItemType.Task)
                .ToList();

            // 2) Skapa story VMs
            var storyById = new Dictionary<int, StoryVm>();
            foreach (var s in stories)
            {
                var vm = MapStory(s, options);
                AddPullRequests(vm, s.PullRequests, sourceTaskId: null);
                storyById[s.Id] = vm;
            }

            // 3) Skapa task VMs och attach till parent story
            var orphanTasks = new List<TaskVm>();

            foreach (var t in tasks)
            {
                var parentId = options.ParentIdSelector(t);
                var tvm = MapTask(t, parentId ?? 0, options, now);

                if (parentId.HasValue && storyById.TryGetValue(parentId.Value, out var parentStory))
                {
                    parentStory.Tasks.Add(tvm);
                    AddPullRequests(parentStory, tvm.PullRequests, sourceTaskId: tvm.Id);
                }
                else
                {
                    orphanTasks.Add(tvm);
                }
            }

            // 4) Orphans: skapa placeholder-story eller häng dem under en “Orphans”-story
            if (orphanTasks.Count > 0 && options.CreatePlaceholderTasksForOrphans)
            {
                // Grupp per StoryId (som du redan satt i MapTask via parentId ?? 0)
                foreach (var grp in orphanTasks.GroupBy(t => t.StoryId))
                {
                    var pid = grp.Key;

                    // pid=0 betyder “ingen parent alls”, lägg under en gemensam Unknown
                    if (pid == 0)
                    {
                        var unknown = storyById.TryGetValue(-1, out var existing)
                            ? existing
                            : (storyById[-1] = new StoryVm
                            {
                                Id = -1,
                                Key = "ORPHANS",
                                Title = "Orphan tasks (no parent link)",
                                CreatedDate = DateTime.UtcNow,
                                Tags = new[] { "orphan" }
                            });

                        foreach (var t in grp)
                        {
                            unknown.Tasks.Add(t);
                            AddPullRequests(unknown, t.PullRequests, sourceTaskId: t.Id);
                        }
                        continue;
                    }

                    // Saknad parent => placeholder story med samma id som parentId (så relationerna blir stabila)
                    if (!storyById.TryGetValue(pid, out var placeholder))
                    {
                        placeholder = new StoryVm
                        {
                            Id = pid,
                            Key = pid.ToString(),
                            Title = $"(Missing parent) {pid}",
                            CreatedDate = DateTime.UtcNow,
                            Tags = new[] { "missing-parent" }
                        };
                        storyById[pid] = placeholder;
                    }

                    foreach (var t in grp)
                    {
                        placeholder.Tasks.Add(t);
                        AddPullRequests(placeholder, t.PullRequests, sourceTaskId: t.Id);
                    }
                }

                orphanTasks.Clear();
            }

            // 5) Derive StoryStage + CompletedDate för stories
            foreach (var story in storyById.Values)
            {
                story.Stage = DeriveStoryStage(story);
                // om story inte har CompletedDate men alla tasks Done -> sätt
                if (!story.CompletedDate.HasValue && story.Tasks.Count > 0 && story.Tasks.All(IsTaskComplete))
                    story.CompletedDate = story.Tasks.Max(t => t.CompletedDate) ?? story.CompletedDate;

                story.RefreshFlowCards();
            }

            // 6) Returnera sorterad lista (kan du ändra)
            var ordered = storyById.Values
                .OrderBy(s => SprintGoalTagParser.GetFirstNumberFromSprintGoalText(s.SprintGoal))
                .ThenBy(s => s.SprintGoal)
                .ThenBy(s => s.Id)
                .ToList();

            return new BindingList<StoryVm>(ordered);
        }

        private static StoryVm MapStory(WorkItemDto s, MapOptions options)
        {
            return new StoryVm
            {
                Id = s.Id,
                Key = options.KeySelector(s) ?? s.Id.ToString(CultureInfo.InvariantCulture),
                Title = s.Title ?? "",
                Developer = s.AssignedTo ?? "",
                SprintGoal = options.SprintGoalSelector(s) ?? "",
                StoryPoints = s.StoryPoints.HasValue
                    ? s.SPInt == 0 ? (int)Math.Round(s.StoryPoints.Value) : s.SPInt
                    : null,
                Tags = (s.Tags ?? new List<string>()).ToList(),
                CreatedDate = ToLocalSafe(s.CreatedDate),
                CompletedDate = s.ClosedDate.HasValue ? ToLocalSafe(s.ClosedDate.Value) : null,
                Stage = StoryStage.New,
                Tasks = new BindingList<TaskVm>(),
                PullRequests = new BindingList<PullRequestCardVm>(),
                FlowCards = new BindingList<FlowCardVm>()
            };
        }

        private static TaskVm MapTask(WorkItemDto t, int parentStoryId, MapOptions options, DateTime nowUtc)
        {
            var stage = DeriveTaskStage(t);
            var status = DeriveTaskStatus(t, stage);

            DateTime? completed = null;
            if (t.StateEnum == WorkItemState.Closed)
            {
                completed = t.ClosedDate.HasValue ? ToLocalSafe(t.ClosedDate.Value) : null;

                if (!completed.HasValue && options.UseResolvedDateAsCompletedIfClosedMissing && t.ResolvedDate.HasValue)
                    completed = ToLocalSafe(t.ResolvedDate.Value);
            }

            var statusChanged = t.ChangedDate.HasValue ? ToLocalSafe(t.ChangedDate.Value) : (DateTime?)null;

            return new TaskVm
            {
                Id = t.Id,
                Key = options.KeySelector(t) ?? t.Id.ToString(CultureInfo.InvariantCulture),
                StoryId = parentStoryId,
                Title = t.Title ?? "",
                Stage = stage,
                Status = status,
                AssignedTo = t.AssignedTo ?? "",
                Activity = t.Activity ?? "",
                IsBlocked = t.IsBlocked,
                Tags = (t.Tags ?? new List<string>()).ToList(),
                IsPlaceholder = false,
                CreatedDate = ToLocalSafe(t.CreatedDate),
                CompletedDate = completed,
                StatusChangedDate = statusChanged,
                PullRequests = (t.PullRequests ?? new List<PullRequestSimpleDto>())
                    .Select(pr => PullRequestCardVm.FromSimple(pr, parentStoryId, t.Id))
                    .ToList()
            };
        }

        private static TaskStage DeriveTaskStage(WorkItemDto t)
        {
            // 1) “separata workflows” via Activity or tags (justera efter era conventions).
            // De ligger kvar i sin kolumn även när work item-state är Closed.
            var activity = Norm(t.Activity);
            var tags = (t.Tags ?? new List<string>()).Select(Norm).ToHashSet();

            if (activity is "code review" or "code-review" or "codereview" or "review" ||
                tags.Contains("pr") || tags.Contains("code-review") || tags.Contains("codereview") || tags.Contains("review"))
                return TaskStage.CodeReview;

            if (activity is "test" or "testing" or "qa" ||
                tags.Contains("test") || tags.Contains("testing") || tags.Contains("qa"))
                return TaskStage.Test;

            if (activity is "doc" or "docs" or "documentation" ||
                tags.Contains("doc") || tags.Contains("docs") || tags.Contains("documentation"))
                return TaskStage.Documentation;

            // 2) Closed => Done för vanliga utvecklingstasks.
            if (t.StateEnum == WorkItemState.Closed)
                return TaskStage.Done;

            // 3) normal dev stage via state
            return t.StateEnum switch
            {
                WorkItemState.New => TaskStage.New,
                WorkItemState.Active => TaskStage.Active,
                WorkItemState.Resolved => TaskStage.Resolved,
                WorkItemState.Done => TaskStage.Resolved, // eller Done om ni vill
                WorkItemState.Removed => TaskStage.None,
                _ => TaskStage.None
            };
        }

        private static FlowStatus DeriveTaskStatus(WorkItemDto t, TaskStage stage)
        {
            // Closed => Closed
            if (t.StateEnum == WorkItemState.Closed)
                return FlowStatus.Closed;

            var tags = (t.Tags ?? new List<string>()).Select(Norm).ToHashSet();
            if (tags.Contains("notok") || tags.Contains("failed") || tags.Contains("fail") || tags.Contains("rejected"))
                return FlowStatus.NotOk;

            // För specialstages vill man ofta visa “New/Active/NotOk/Closed”
            return stage switch
            {
                TaskStage.CodeReview or TaskStage.Test or TaskStage.Documentation =>
                    t.StateEnum == WorkItemState.New ? FlowStatus.New : FlowStatus.Active,

                _ =>
                    t.StateEnum == WorkItemState.New ? FlowStatus.New : FlowStatus.Active
            };
        }

        private static StoryStage DeriveStoryStage(StoryVm story)
        {
            // story completed?
            if (story.CompletedDate.HasValue)
                return StoryStage.Done;

            if (story.Tasks == null || story.Tasks.Count == 0)
                return StoryStage.New;

            // allt klart?
            if (story.Tasks.All(IsTaskComplete))
                return StoryStage.Done;

            // ordning: Documentation > Testing > CodeReview > Development > New
            if (story.Tasks.Any(t => t.Stage == TaskStage.Documentation && t.Status != FlowStatus.Closed))
                return StoryStage.Documentation;

            if (story.Tasks.Any(t => t.Stage == TaskStage.Test && t.Status != FlowStatus.Closed))
                return StoryStage.Testing;

            if (story.Tasks.Any(t => t.Stage == TaskStage.CodeReview && t.Status != FlowStatus.Closed))
                return StoryStage.CodeReview;

            if (story.Tasks.Any(t => t.Stage is TaskStage.Active or TaskStage.Resolved))
                return StoryStage.Development;

            if (story.Tasks.Any(t => t.Stage == TaskStage.New))
                return StoryStage.New;

            return StoryStage.New;
        }

        private static bool IsTaskComplete(TaskVm task) =>
            task.Stage == TaskStage.Done ||
            (task.Stage is TaskStage.CodeReview or TaskStage.Test or TaskStage.Documentation &&
             task.Status == FlowStatus.Closed);

        private static void AddPullRequests(
            StoryVm story,
            IEnumerable<PullRequestCardVm> pullRequests,
            int? sourceTaskId)
        {
            foreach (var pr in pullRequests)
            {
                if (story.PullRequests.Any(existing =>
                        existing.RepoId == pr.RepoId &&
                        existing.PullRequestId == pr.PullRequestId))
                {
                    continue;
                }

                if (pr.StoryId == 0)
                    pr.StoryId = story.Id;

                pr.SourceTaskId ??= sourceTaskId;
                story.PullRequests.Add(pr);
            }
        }

        private static void AddPullRequests(
            StoryVm story,
            IEnumerable<PullRequestSimpleDto> pullRequests,
            int? sourceTaskId)
        {
            AddPullRequests(
                story,
                (pullRequests ?? Enumerable.Empty<PullRequestSimpleDto>())
                    .Select(pr => PullRequestCardVm.FromSimple(pr, story.Id, sourceTaskId)),
                sourceTaskId);
        }

        private static string Norm(string s) =>
            (s ?? "").Trim().ToLowerInvariant();

        private static DateTime ToLocalSafe(DateTime dt)
        {
            // Om du vill köra allt i UTC kan du ta bort detta.
            return dt.Kind switch
            {
                DateTimeKind.Utc => dt.ToLocalTime(),
                DateTimeKind.Local => dt,
                _ => DateTime.SpecifyKind(dt, DateTimeKind.Local)
            };
        }
    }
}

