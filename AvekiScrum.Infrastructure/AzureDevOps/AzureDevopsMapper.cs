using Microsoft.TeamFoundation.SourceControl.WebApi;
using Microsoft.VisualStudio.Services.WebApi;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using AvekiScrum.Application.Mappers;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Infrastructure.AzureDevOps.Entities;
using AvekiScrum.Infrastructure.AzureDevOps.Offline;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    public static class AzureDevopsMapper
    {
        /// <summary>
        /// Mappar från AzureDevOps SDKs TeamMember till vår lokala TeamMember‐entity.
        /// </summary>
        public static Domain.Entities.Scrum.TeamMemberDto ToEntity(AzureDevOps.Entities.TeamMemberEntity azureMember, string teamName)
        {
            var idRef = azureMember.Identity;
            return new Domain.Entities.Scrum.TeamMemberDto
            {
                AzureId = idRef.Id,
                DisplayName = idRef.DisplayName,
                UniqueName = idRef.UniqueName,
                Email = idRef.UniqueName,        // UPN brukar vara email
                Title = azureMember.Role,        // lägger rollen i Title
                Role = azureMember.Role,        // eller spara i Role‐fältet också
                TeamName = teamName,
                LastSynced = DateTime.UtcNow,
                ImageUrl = idRef.ImageUrl,
                Descriptor = idRef.Descriptor
            };
        }

        /// <summary>
        /// Mappar från AzureDevOps WikiPage (API-modell) till vår WikiPageDto.
        /// Kör rekursivt på SubPages.
        /// </summary>
        public static WikiPageDto ToDto(WikiPage page)
        {
            return new WikiPageDto
            {
                Path = page.Path,
                Order = page.Order,
                IsParentPage = page.IsParentPage,
                Url = page.Url,
                Content = page.Content,
                SubPages = page.SubPages?
                                    .Select(ToDto)
                                    .ToList()
                                ?? new List<WikiPageDto>()
            };
        }

        /// <summary>
        /// Hjälpmetod för att mappa en lista WikiPage → WikiPageDto.
        /// </summary>
        public static List<WikiPageDto> ToDtoList(IEnumerable<WikiPage> pages)
        {
            return pages
                .Select(ToDto)
                .ToList();
        }

        /// <summary>
        /// Mappar tillbaka från WikiPageDto till WikiPage.
        /// Om du behöver skicka tillbaka eller spara som JSON-modell.
        /// </summary>
        public static WikiPage FromDto(WikiPageDto dto)
        {
            return new WikiPage
            {
                Path = dto.Path,
                Order = dto.Order,
                IsParentPage = dto.IsParentPage,
                Url = dto.Url,
                // remoteUrl och gitItemPath saknas i DTO – lämna orörda eller sätt tomma
                RemoteUrl = string.Empty,
                GitItemPath = string.Empty,
                Content = dto.Content,
                SubPages = dto.SubPages?
                                  .Select(FromDto)
                                  .ToList()
                                ?? new List<WikiPage>()
            };
        }

        /// <summary>
        /// Mappar ett enskilt AzureDevOps-Iteration-objekt till vår Sprint-entity.
        /// </summary>
        public static Sprint ToSprint(Iteration iteration)
        {
            var attrs = iteration.Attributes;
            return new Sprint
            {
                Id = iteration.Id,
                Name = iteration.Name,
                Path = iteration.Path,
                StartDate = attrs.StartDate,    // kräver att Attributes har DateTime StartDate
                EndDate = attrs.FinishDate,   // och DateTime FinishDate
                IsCurrent = string.Equals(
                                attrs.TimeFrame,
                                "current",
                                StringComparison.OrdinalIgnoreCase
                             )
            };
        }

        /// <summary>
        /// Mappar en lista av Iteration → lista av Sprint.
        /// </summary>
        public static List<Sprint> ToSprintList(IEnumerable<Iteration> iterations) => iterations.Select(ToSprint).ToList();


        public static WorkItemDto ToDto(this WorkItemWithFields workItemWithFields)
        {
            var dto = new WorkItemDto
            {
                Id = workItemWithFields.Id,
                SystemId = workItemWithFields.Fields.SystemId,
                Title = workItemWithFields.Fields.Title,
                State = workItemWithFields.Fields.State,
                Type = workItemWithFields.Fields.WorkItemType,
                AssignedTo = workItemWithFields.Fields.AssignedTo?.DisplayName,
                AssignedToEmail = workItemWithFields.Fields.AssignedTo?.UniqueName,
                DevelopmentPartner = workItemWithFields.Fields.DevelopmentPartner?.DisplayName,
                CreatedBy = workItemWithFields.Fields.CreatedBy?.DisplayName,
                Priority = workItemWithFields.Fields.Priority,
                Severity = workItemWithFields.Fields.Severity,
                StoryPoints = workItemWithFields.Fields.StoryPoints ?? 0.0,
                AreaPath = workItemWithFields.Fields.AreaPath,
                IterationPath = workItemWithFields.Fields.IterationPath,
                Activity = workItemWithFields.Fields.Activity,
                Blocked = workItemWithFields.Fields.Blocked,
                ClosedDate = workItemWithFields.Fields.ClosedDate,
                ResolvedDate = workItemWithFields.Fields.ResolvedDate,
                ChangedDate = workItemWithFields.Fields.ChangedDate,
                CreatedDate = workItemWithFields.Fields.CreatedDate,
                TypeEnum = AzureEnumMapper.MapType(workItemWithFields.Fields.WorkItemType),
                StateEnum = AzureEnumMapper.MapState(workItemWithFields.Fields.State),
                AssignedTeam = workItemWithFields.Fields.AssignedTeam,
                Source = workItemWithFields.Fields.Source,
                ExternalLink = workItemWithFields.Fields.ExternalLink,
                StakeholdersHtml = workItemWithFields.Fields.Stakeholders,
                Stakeholders = workItemWithFields.Fields.Stakeholders != null
                    ? workItemWithFields.Fields.Stakeholders.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(t => t.Trim())
                        .Where(t => t.Length > 0)
                        .ToList()
                    : new List<string>(),
                Tags = workItemWithFields.Fields.Tags != null
                    ? workItemWithFields.Fields.Tags.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(t => t.Trim())
                        .ToList()
                    : new List<string>(),
                SourceEnum = AzureEnumMapper.MapSource(workItemWithFields.Fields.Source),
            };

            dto.IsBlocked = IsBlocked(dto.Blocked) ||
                            dto.Tags.Any(t => string.Equals(t, "Blocked", StringComparison.OrdinalIgnoreCase));

            // relationer
            dto.ParentId = AzureWorkItemRelationParser.TryGetParentId(workItemWithFields.Relations);
            dto.ChildIds = AzureWorkItemRelationParser.GetChildIds(workItemWithFields.Relations);

            dto.PullRequests = AzureWorkItemRelationParser.GetPullRequests(workItemWithFields.Relations);
            dto.Commits = AzureWorkItemRelationParser.GetCommits(workItemWithFields.Relations);

            return dto;
        }

        private static bool IsBlocked(string value)
            => string.Equals(value, "Yes", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(value, "True", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(value, "Blocked", StringComparison.OrdinalIgnoreCase);

        private static readonly Regex RefHeadPrefix = new(@"^refs/heads/", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        /// <summary>
        /// Projekt-specifik mapping från SDK-PR till lätt DTO.
        /// </summary>
        public static PullRequestDto ToDto(
            this GitPullRequest pr,
            bool includeCommits = false,
            bool includeLabels = true,
            bool includeWorkItems = true)
        {
            if (pr == null) throw new ArgumentNullException(nameof(pr));

            var repo = pr.Repository;
            var project = repo?.ProjectReference; // GitRepository.ProjectReference finns i SDK

            // Länkar (defensivt: olika SDK-representationer)
            var (web, self) = TryGetHrefPair(pr.Links);

            // Branch-normalisering
            string src = pr.SourceRefName ?? string.Empty;
            string tgt = pr.TargetRefName ?? string.Empty;

            // Merge-ref
            CommitRefDto MapRef(GitCommitRef? cr) =>
                cr == null ? null! :
                new CommitRefDto
                {
                    CommitId = cr.CommitId ?? string.Empty,
                    Url = cr.Url
                };

            // Reviewers
            IReadOnlyList<ReviewerDto> reviewers = pr.Reviewers?.Select(r => new ReviewerDto
            {
                Id = r.Id,
                UniqueName = r.UniqueName,
                DisplayName = r.DisplayName,
                ImageUrl = TryGetSmallImageUrl(r),
                Vote = r.Vote,
                IsRequired = r.IsRequired,
                HasDeclined = GetNullableBool(r, "HasDeclined")
            }).ToArray() ?? Array.Empty<ReviewerDto>();

            // Labels
            IReadOnlyList<string> labels = includeLabels
                ? pr.Labels?.Select(l => l?.Name).Where(n => !string.IsNullOrWhiteSpace(n))!.Cast<string>().Distinct().OrderBy(x => x).ToArray()
                    ?? Array.Empty<string>()
                : Array.Empty<string>();

            // Commits (tungt, ofta onödigt)
            IReadOnlyList<CommitDto> commits = includeCommits
                ? pr.Commits?.Select(c => new CommitDto
                {
                    CommitId = c.CommitId ?? string.Empty,
                    Comment = c.Comment,
                    Url = c.Url,
                    RemoteUrl = c.RemoteUrl,
                    Author = c.Author == null ? null : new SignatureDto
                    {
                        Name = c.Author.Name,
                        Email = c.Author.Email,
                        WhenUtc = c.Author.Date.ToUniversalTime()
                    },
                    Committer = c.Committer == null ? null : new SignatureDto
                    {
                        Name = c.Committer.Name,
                        Email = c.Committer.Email,
                        WhenUtc = c.Committer.Date.ToUniversalTime()
                    }
                }).ToArray() ?? Array.Empty<CommitDto>()
                : Array.Empty<CommitDto>();

            // Work item IDs (från ResourceRef.Url eller .Id)
            IReadOnlyList<int> wiids = includeWorkItems
                ? pr.WorkItemRefs?.Select(TryParseWorkItemId).Where(i => i.HasValue).Select(i => i!.Value).Distinct().OrderBy(i => i).ToArray()
                    ?? Array.Empty<int>()
                : Array.Empty<int>();

            return new PullRequestDto
            {
                PullRequestId = pr.PullRequestId,
                CodeReviewId = pr.CodeReviewId,
                Status = pr.Status.ToString(),
                IsDraft = pr.IsDraft,
                HasMultipleMergeBases = pr.HasMultipleMergeBases,

                CreatedUtc = ToUtcNullable(pr.CreationDate),
                ClosedUtc = ToUtcNullable(pr.ClosedDate),
                CompletionQueueUtc = ToUtcNullable(pr.CompletionQueueTime),

                Title = pr.Title ?? string.Empty,
                Description = pr.Description,

                SourceRef = src,
                TargetRef = tgt,
                SourceBranch = StripRefHead(src),
                TargetBranch = StripRefHead(tgt),

                WebUrl = web,
                ApiUrl = self ?? pr.Url,
                RemoteUrl = pr.RemoteUrl,
                ArtifactId = pr.ArtifactId,

                RepositoryId = repo?.Id.ToString() ?? string.Empty,
                RepositoryName = repo?.Name ?? string.Empty,
                ProjectId = project?.Id.ToString() ?? string.Empty,
                ProjectName = project?.Name ?? repo?.ProjectReference?.Name ?? string.Empty,

                CreatedBy = MapIdentity(pr.CreatedBy),
                ClosedBy = MapIdentity(pr.ClosedBy),
                AutoCompleteSetBy = MapIdentity(pr.AutoCompleteSetBy),

                Merge = new MergeStateDto
                {
                    AsyncStatus = pr.MergeStatus.ToString(),
                    FailureType = pr.MergeFailureType.ToString(),
                    FailureMessage = pr.MergeFailureMessage,
                    MergeId = pr.MergeId == Guid.Empty ? null : pr.MergeId,

                    LastSource = MapRef(pr.LastMergeSourceCommit),
                    LastTarget = MapRef(pr.LastMergeTargetCommit),
                    LastMerge = MapRef(pr.LastMergeCommit)
                },

                Reviewers = reviewers,
                Labels = labels,
                Commits = commits,
                WorkItemIds = wiids
            };
        }

        // ---------- Helpers ----------

        private static DateTime? ToUtcNullable(DateTime dt)
            => dt == default ? null : DateTime.SpecifyKind(dt, dt.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : dt.Kind).ToUniversalTime();

        private static string StripRefHead(string refName)
            => string.IsNullOrWhiteSpace(refName) ? string.Empty : RefHeadPrefix.Replace(refName, "");

        private static IdentityDto? MapIdentity(Microsoft.VisualStudio.Services.WebApi.IdentityRef? id)
            => id == null ? null : new IdentityDto
            {
                Id = id.Id,
                UniqueName = id.UniqueName,
                DisplayName = id.DisplayName,
                ImageUrl = TryGetSmallImageUrl(id)
            };

        /// <summary>
        /// Försöker extrahera "web" och "self" href från ReferenceLinks.
        /// SDK har varierat över versioner – vi tar både via indexer/dictionary och via reflektion.
        /// </summary>
        private static (string? web, string? self) TryGetHrefPair(ReferenceLinks? links)
        {
            if (links == null) return (null, null);

            string? TryGet(string key)
            {
                try
                {
                    // Vanligast: links.Links är IDictionary<string, object> där value har Href
                    var dictProp = links.GetType().GetProperty("Links");
                    var dict = dictProp?.GetValue(links) as System.Collections.IDictionary;
                    if (dict != null && dict.Contains(key))
                    {
                        var entry = dict[key];
                        var hrefProp = entry?.GetType().GetProperty("Href");
                        var href = hrefProp?.GetValue(entry) as string;
                        if (!string.IsNullOrWhiteSpace(href)) return href;
                    }

                    // Ibland indexer: links["web"]
                    var indexer = links.GetType().GetProperties().FirstOrDefault(p =>
                        p.GetIndexParameters().Length == 1 && p.GetIndexParameters()[0].ParameterType == typeof(string));
                    if (indexer != null)
                    {
                        var entry = indexer.GetValue(links, new object[] { key });
                        var hrefProp = entry?.GetType().GetProperty("Href");
                        var href = hrefProp?.GetValue(entry) as string;
                        if (!string.IsNullOrWhiteSpace(href)) return href;
                    }
                }
                catch
                {
                    // swallow – länk är optional
                }
                return null;
            }

            return (TryGet("web"), TryGet("self"));
        }

        private static string? TryGetSmallImageUrl(Microsoft.VisualStudio.Services.WebApi.IdentityRef id)
        {
            try
            {
                // IdentityRef._links.avatar.href (olika SDK)
                var linksProp = id.GetType().GetProperty("Links")?.GetValue(id);
                if (linksProp == null) return null;

                var dictProp = linksProp.GetType().GetProperty("Links");
                var dict = dictProp?.GetValue(linksProp) as System.Collections.IDictionary;
                if (dict != null && dict.Contains("avatar"))
                {
                    var avatar = dict["avatar"];
                    var hrefProp = avatar?.GetType().GetProperty("Href");
                    return hrefProp?.GetValue(avatar) as string;
                }
            }
            catch { /* optional */ }
            return null;
        }

        private static bool? GetNullableBool(object obj, string propertyName)
        {
            try
            {
                var prop = obj.GetType().GetProperty(propertyName);
                if (prop == null) return null;
                var val = prop.GetValue(obj);
                return val as bool? ?? (val is bool b ? b : null);
            }
            catch { return null; }
        }

        /// <summary>
        /// Försöker plocka ut WI-ID ur ResourceRef.Url (".../_apis/wit/workItems/12345") eller .Id.
        /// </summary>
        private static int? TryParseWorkItemId(ResourceRef? rr)
        {
            if (rr == null) return null;
            if (int.TryParse(rr.Id, out var direct)) return direct;

            if (!string.IsNullOrWhiteSpace(rr.Url))
            {
                // matcha sista numret i URL:en
                var m = Regex.Match(rr.Url!, @"(?<!\d)(\d+)(?!.*\d)");
                if (m.Success && int.TryParse(m.Groups[1].Value, out var id))
                    return id;
            }
            return null;
        }
    }
}
