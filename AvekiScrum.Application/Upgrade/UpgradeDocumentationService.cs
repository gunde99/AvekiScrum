using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using AvekiScrum.Application.Abstractions.Repositories;
using AvekiScrum.Application.Abstractions.Services;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Domain.Entities.Upgrade;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Application.Upgrade
{
    /// <summary>
    /// AvekiDokumentation → Uppgradering. Reads the release/module structure straight from the wiki
    /// repo, and runs the consultant's whole flow on git in the background: a checkout is a branch, a
    /// save is a commit, "Lämna in" merges the branch into the wiki (through a pull request nobody
    /// sees), and a clash with someone else's change comes back as a side-by-side merge in our own UI.
    /// See UPPGRADERINGSDOKUMENTATION_SPEC.md §0.
    /// </summary>
    public sealed class UpgradeDocumentationService
    {
        private static readonly Regex AppliesToRe = new(@"\*\*Gäller:\*\*\s*(?<v>.+?)(?:\s+·|$)", RegexOptions.Compiled);

        // The page tree only changes when the wiki does, so it's cached per wikiMaster commit.
        private static readonly object StructureLock = new();
        private static (string Commit, UpgradeStructureDto Structure)? _structureCache;

        private readonly IWikiGitClient _git;
        private readonly IUpgradeCheckoutRepository _repository;
        private readonly UpgradeDocumentationSettings _settings;

        public UpgradeDocumentationService(IWikiGitClient git, IUpgradeCheckoutRepository repository, IOptions<UpgradeDocumentationSettings> settings)
        {
            _git = git;
            _repository = repository;
            _settings = settings.Value;
        }

        private string Root => _settings.RootPath.TrimEnd('/');
        private WikiGitVersion Master => WikiGitVersion.OfBranch(_settings.Branch);
        private string FullPath(string id) => $"{Root}/{id}";
        private string IdOf(string fullPath) => fullPath[(Root.Length + 1)..];

        // ---------------------------------------------------------------- structure

        public async Task<UpgradeStructureDto> GetStructureAsync(CancellationToken ct = default)
        {
            var head = await _git.GetBranchHeadAsync(_settings.Branch, ct)
                ?? throw new UpgradeException($"Wikigrenen {_settings.Branch} hittades inte.", 502);
            lock (StructureLock)
            {
                if (_structureCache is { } cached && cached.Commit == head) return cached.Structure;
            }

            var items = await _git.ListTreeAsync(Root, WikiGitVersion.OfCommit(head), ct);
            if (items.Count == 0)
                throw new UpgradeException($"Hittade inget under {Root} i wikin. Kontrollera UpgradeDocumentation:RootPath.", 502);

            var byFolder = items
                .Where(i => !i.IsFolder && i.Path.StartsWith(Root + "/", StringComparison.Ordinal))
                .GroupBy(i => i.Path[..i.Path.LastIndexOf('/')])
                .ToDictionary(g => g.Key, g => g.Select(i => i.Path).ToList());
            var folders = items.Where(i => i.IsFolder).Select(i => i.Path).ToHashSet();

            var products = new List<UpgradeProductDto>();
            foreach (var productFolder in ChildFolders(folders, Root))
            {
                var productName = WikiPathCodec.TitleOf(productFolder);
                if (_settings.IgnoredFolders.Contains(productName, StringComparer.OrdinalIgnoreCase)) continue;

                var releases = new List<UpgradeReleaseDto>();
                foreach (var releaseFolder in ChildFolders(folders, productFolder).OrderBy(f => WikiPathCodec.TitleOf(f), ReleaseComparer.Instance))
                {
                    var pageFiles = byFolder.TryGetValue(releaseFolder, out var files)
                        ? files.Where(f => f.EndsWith(".md", StringComparison.OrdinalIgnoreCase)).ToList()
                        : new List<string>();
                    var order = await ReadOrderAsync(releaseFolder, byFolder, head, ct);
                    var ordered = pageFiles
                        .OrderBy(f => { var idx = order.IndexOf(StemOf(f)); return idx < 0 ? int.MaxValue : idx; })
                        .ThenBy(f => WikiPathCodec.TitleOf(f), StringComparer.CurrentCultureIgnoreCase)
                        .ToList();

                    var pages = await Task.WhenAll(ordered.Select(async f =>
                    {
                        var content = await _git.GetFileTextAsync(f, WikiGitVersion.OfCommit(head), ct) ?? "";
                        var appliesTo = ReadAppliesTo(content);
                        return new UpgradePageDto(IdOf(f), WikiPathCodec.TitleOf(f), appliesTo,
                            appliesTo.StartsWith("Alla kunder", StringComparison.OrdinalIgnoreCase));
                    }));
                    releases.Add(new UpgradeReleaseDto(WikiPathCodec.TitleOf(releaseFolder), pages));
                }
                products.Add(new UpgradeProductDto(productName, releases));
            }

            var structure = new UpgradeStructureDto(head, products);
            lock (StructureLock) _structureCache = (head, structure);
            return structure;
        }

        private static IEnumerable<string> ChildFolders(HashSet<string> folders, string parent) =>
            folders.Where(f => f.StartsWith(parent + "/", StringComparison.Ordinal) && f.IndexOf('/', parent.Length + 1) < 0);

        private static string StemOf(string path)
        {
            var name = path[(path.LastIndexOf('/') + 1)..];
            return name.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ? name[..^3] : name;
        }

        private async Task<List<string>> ReadOrderAsync(string folder, Dictionary<string, List<string>> byFolder, string commit, CancellationToken ct)
        {
            if (!byFolder.TryGetValue(folder, out var files) || !files.Contains(folder + "/.order")) return new List<string>();
            var text = await _git.GetFileTextAsync(folder + "/.order", WikiGitVersion.OfCommit(commit), ct) ?? "";
            return text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
        }

        internal static string ReadAppliesTo(string content)
        {
            var firstLine = content.Replace("\r\n", "\n").TrimStart('﻿', '\n').Split('\n')[0];
            var m = AppliesToRe.Match(firstLine);
            return m.Success ? m.Groups["v"].Value.Trim() : "";
        }

        /// <summary>"2026.10" after "2026.9" - release names compared number by number.</summary>
        private sealed class ReleaseComparer : IComparer<string>
        {
            public static readonly ReleaseComparer Instance = new();
            public int Compare(string? x, string? y)
            {
                var a = (x ?? "").Split('.');
                var b = (y ?? "").Split('.');
                for (var i = 0; i < Math.Max(a.Length, b.Length); i++)
                {
                    var ai = i < a.Length ? a[i] : "";
                    var bi = i < b.Length ? b[i] : "";
                    var c = int.TryParse(ai, out var an) && int.TryParse(bi, out var bn)
                        ? an.CompareTo(bn)
                        : string.Compare(ai, bi, StringComparison.OrdinalIgnoreCase);
                    if (c != 0) return c;
                }
                return 0;
            }
        }

        // ---------------------------------------------------------------- checkouts

        public async Task<IReadOnlyList<UpgradeCheckoutSummaryDto>> ListAsync(CancellationToken ct = default) =>
            (await _repository.GetAllAsync(ct)).Select(ToSummary).ToList();

        public async Task<UpgradeCheckoutDetailDto> CreateAsync(CreateUpgradeCheckoutRequest request, UpgradeActor actor, CancellationToken ct = default)
        {
            var customer = request.Customer?.Trim() ?? "";
            if (customer.Length == 0) throw new UpgradeException("Ange kund.");
            if (request.Releases is null || request.Releases.Count == 0) throw new UpgradeException("Välj minst en release.");

            var structure = await GetStructureAsync(ct);
            var product = structure.Products.FirstOrDefault(p => p.Name == request.Product)
                ?? throw new UpgradeException($"Produkten {request.Product} finns inte i wikin.");

            var releases = request.Releases.Distinct().OrderBy(r => r, ReleaseComparer.Instance).ToList();
            var modules = new HashSet<string>(request.Modules ?? Array.Empty<string>(), StringComparer.Ordinal);
            var sections = new List<UpgradeCheckoutSection>();
            foreach (var releaseName in releases)
            {
                var release = product.Releases.FirstOrDefault(r => r.Name == releaseName)
                    ?? throw new UpgradeException($"Releasen {releaseName} finns inte under {product.Name}.");
                sections.AddRange(release.Pages
                    .Where(p => p.Always || modules.Contains(p.Title))
                    .Select(p => new UpgradeCheckoutSection { Release = release.Name, Title = p.Title, Path = FullPath(p.Id), AppliesTo = p.AppliesTo }));
            }
            if (sections.Count == 0) throw new UpgradeException("Inga sidor matchar valet.");

            var id = NewId();
            var branch = $"{_settings.BranchPrefix}{Slug(customer)}-{releases[^1]}-{id}";
            await _git.CreateBranchAsync(branch, structure.Commit, ct);

            var now = DateTimeOffset.UtcNow;
            var checkout = new UpgradeCheckout
            {
                Id = id,
                Customer = customer,
                Product = product.Name,
                Releases = releases,
                Modules = sections.Select(s => s.Title).Distinct().ToList(),
                Sections = sections,
                Branch = branch,
                BaseCommit = structure.Commit,
                HeadCommit = structure.Commit,
                CreatedByName = actor.Name,
                CreatedByEmail = actor.Email,
                CreatedAt = now,
                UpdatedAt = now,
            };
            Log(checkout, actor, $"Utcheckad: {product.Name} {string.Join(", ", releases)}, {sections.Count} sidor.");
            await _repository.SaveAsync(checkout, ct);
            return await GetAsync(id, ct);
        }

        public async Task<UpgradeCheckoutDetailDto> GetAsync(string id, CancellationToken ct = default)
        {
            var checkout = await LoadAsync(id, ct);
            var working = checkout.Status is UpgradeCheckoutStatus.Active or UpgradeCheckoutStatus.Conflict;

            // Once merged or cancelled the branch is gone - show the wiki as it was merged (or the
            // base, for a cancelled one) so the record still opens.
            var readVersion = working
                ? WikiGitVersion.OfBranch(checkout.Branch)
                : WikiGitVersion.OfCommit(checkout.MergedCommit ?? checkout.BaseCommit);
            var head = working ? await _git.GetBranchHeadAsync(checkout.Branch, ct) : null;
            if (working && head is null)
                throw new UpgradeException($"Grenen för utcheckningen ({checkout.Branch}) finns inte längre i wikin.", 410);
            if (head is not null && head != checkout.HeadCommit)
            {
                checkout.HeadCommit = head;
                await _repository.SaveAsync(checkout, ct);
            }

            var sections = await Task.WhenAll(checkout.Sections.Select(async s =>
            {
                var current = await _git.GetFileTextAsync(s.Path, readVersion, ct) ?? "";
                var baseText = await _git.GetFileTextAsync(s.Path, WikiGitVersion.OfCommit(checkout.BaseCommit), ct) ?? "";
                var master = working ? await _git.GetFileTextAsync(s.Path, Master, ct) ?? "" : baseText;
                return new UpgradeSectionDto(
                    IdOf(s.Path), s.Release, s.Title, s.AppliesTo, current,
                    Changed: !SameText(current, baseText),
                    WikiChanged: working && !SameText(master, baseText),
                    Completed: checkout.CompletedSections.Contains(s.Path));
            }));

            var conflicts = checkout.Status == UpgradeCheckoutStatus.Conflict && checkout.PullRequestId is int pr
                ? await LoadConflictsAsync(checkout, pr, ct)
                : Array.Empty<UpgradeConflictDto>();

            return new UpgradeCheckoutDetailDto(
                ToSummary(checkout),
                checkout.HeadCommit,
                sections,
                checkout.History.Select(h => new UpgradeHistoryDto(h.At, h.By, h.Text)).ToList(),
                conflicts);
        }

        public async Task<SaveUpgradeSectionResult> SaveSectionAsync(string id, SaveUpgradeSectionRequest request, UpgradeActor actor, CancellationToken ct = default)
        {
            var checkout = await LoadWorkingAsync(id, ct);
            var section = FindSection(checkout, request.SectionId);
            var current = await _git.GetFileTextAsync(section.Path, WikiGitVersion.OfBranch(checkout.Branch), ct) ?? "";
            var content = UpgradeDocumentFormat.Normalize(request.Content ?? "");
            if (SameText(current, content)) return new SaveUpgradeSectionResult(checkout.HeadCommit, false);

            var newHead = await _git.PushAsync(
                checkout.Branch,
                string.IsNullOrEmpty(request.ExpectedHead) ? checkout.HeadCommit : request.ExpectedHead,
                new[] { new WikiGitChange(WikiGitChangeType.Edit, section.Path, content) },
                $"Uppgradering {checkout.Customer} ({checkout.Id}): {section.Release} {section.Title} – {actor.Name}",
                ct) ?? throw new UpgradeException("Dokumentet har sparats från ett annat fönster sedan du öppnade det. Ladda om och gör ändringen igen.", 409);

            checkout.HeadCommit = newHead;
            Log(checkout, actor, $"Sparade {section.Release} {section.Title}.");
            await _repository.SaveAsync(checkout, ct);
            return new SaveUpgradeSectionResult(newHead, true);
        }

        /// <summary>
        /// Konsultens egen checklista: bocka av en sektion som klar, eller ångra. Rör varken grenen
        /// eller wikin, och skrivs inte i historiken - det är ett arbetsverktyg, inte en ändring.
        /// Går även efter att ändringarna förts in, eftersom uppgraderingen kan pågå längre än så.
        /// </summary>
        public async Task<bool> SetSectionCompletedAsync(string id, SetUpgradeSectionCompletedRequest request, CancellationToken ct = default)
        {
            var checkout = await LoadAsync(id, ct);
            if (checkout.Status == UpgradeCheckoutStatus.Cancelled)
                throw new UpgradeException("Uppgraderingen är avbruten.", 409);
            var section = FindSection(checkout, request.SectionId);
            checkout.CompletedSections.Remove(section.Path);
            if (request.Completed)
                checkout.CompletedSections.Add(section.Path);
            await _repository.SaveAsync(checkout, ct);
            return request.Completed;
        }

        public async Task<(string FileName, string Content)> ExportAsync(string id, CancellationToken ct = default)
        {
            var detail = await GetAsync(id, ct);
            var checkout = await LoadAsync(id, ct);
            var doc = new UpgradeDocumentFormat.Document(
                checkout.Id, detail.HeadCommit, checkout.Customer, checkout.Product, checkout.Releases,
                checkout.CreatedByName, checkout.CreatedAt,
                detail.Sections.Select(s => new UpgradeDocumentFormat.Section(s.Id, s.Release, s.Title, s.Content)).ToList());
            var fileName = $"Uppgradering_{Slug(checkout.Customer)}_{string.Join("-", checkout.Releases)}_{checkout.Id}.md";
            return (fileName, UpgradeDocumentFormat.Compose(doc));
        }

        public async Task<UpgradeImportResult> ImportAsync(string id, string fileText, UpgradeActor actor, CancellationToken ct = default)
        {
            var checkout = await LoadWorkingAsync(id, ct);
            var parsed = UpgradeDocumentFormat.Parse(fileText ?? "");
            if (parsed.Ok && parsed.CheckoutId != checkout.Id)
                return Failed($"Filen hör till utcheckning {parsed.CheckoutId}, inte {checkout.Id}.");
            if (!parsed.Ok)
                return new UpgradeImportResult(false, parsed.Errors, parsed.Warnings, Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(), checkout.HeadCommit);

            var head = await _git.GetBranchHeadAsync(checkout.Branch, ct) ?? checkout.HeadCommit;
            var fileCommit = string.IsNullOrEmpty(parsed.Commit) ? head : parsed.Commit;
            var changes = new List<WikiGitChange>();
            var applied = new List<string>();
            var skipped = new List<string>();
            var unknown = new List<string>();

            foreach (var (sectionId, content) in parsed.Sections)
            {
                var section = checkout.Sections.FirstOrDefault(s => IdOf(s.Path) == sectionId);
                if (section is null) { unknown.Add(sectionId); continue; }

                var current = await _git.GetFileTextAsync(section.Path, WikiGitVersion.OfCommit(head), ct) ?? "";
                if (SameText(current, content)) continue;

                // Edited in the board after this file was downloaded: overwriting would silently drop
                // that edit, so the page is left alone and the consultant told which one.
                if (fileCommit != head)
                {
                    var atDownload = await _git.GetFileTextAsync(section.Path, WikiGitVersion.OfCommit(fileCommit), ct) ?? "";
                    if (!SameText(atDownload, current)) { skipped.Add($"{section.Release} {section.Title}"); continue; }
                }
                changes.Add(new WikiGitChange(WikiGitChangeType.Edit, section.Path, UpgradeDocumentFormat.Normalize(content)));
                applied.Add($"{section.Release} {section.Title}");
            }

            if (changes.Count > 0)
            {
                var newHead = await _git.PushAsync(checkout.Branch, head, changes,
                    $"Uppgradering {checkout.Customer} ({checkout.Id}): uppladdad fil, {changes.Count} sidor – {actor.Name}", ct)
                    ?? throw new UpgradeException("Dokumentet sparades samtidigt från ett annat fönster. Ladda upp filen igen.", 409);
                checkout.HeadCommit = newHead;
                Log(checkout, actor, $"Laddade upp fil: {string.Join(", ", applied)}.");
                await _repository.SaveAsync(checkout, ct);
            }

            var warnings = parsed.Warnings.ToList();
            var missing = checkout.Sections.Count(s => !parsed.Sections.ContainsKey(IdOf(s.Path)));
            if (missing > 0) warnings.Add($"{missing} sidor saknades i filen och lämnades oförändrade.");
            return new UpgradeImportResult(true, Array.Empty<string>(), warnings, applied, skipped, unknown, checkout.HeadCommit);

            UpgradeImportResult Failed(string error) =>
                new(false, new[] { error }, Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(), checkout.HeadCommit);
        }

        public async Task<UpgradeSubmitResult> SubmitAsync(string id, UpgradeActor actor, CancellationToken ct = default)
        {
            var checkout = await LoadWorkingAsync(id, ct);
            var detail = await GetAsync(id, ct);
            var changed = detail.Sections.Where(s => s.Changed).ToList();

            if (changed.Count == 0 && checkout.PullRequestId is null)
            {
                await _git.DeleteBranchAsync(checkout.Branch, ct);
                checkout.Status = UpgradeCheckoutStatus.ClosedUnchanged;
                checkout.ClosedAt = DateTimeOffset.UtcNow;
                Log(checkout, actor, "Avslutad utan ändringar – wikin är orörd.");
                await _repository.SaveAsync(checkout, ct);
                return new UpgradeSubmitResult("ClosedUnchanged", "Inga ändringar att föra in. Utcheckningen är avslutad.", Array.Empty<UpgradeConflictDto>());
            }

            checkout.PullRequestId ??= await _git.CreatePullRequestAsync(
                checkout.Branch, _settings.Branch, CommitMessage(checkout),
                $"Skapad av AvekiDokumentation åt {actor.Name}. Utcheckning {checkout.Id}.", ct);
            await _repository.SaveAsync(checkout, ct);
            return await TryMergeAsync(checkout, actor, changed.Select(s => $"{s.Release} {s.Title}").ToList(), ct);
        }

        public async Task<UpgradeSubmitResult> ResolveAsync(string id, IReadOnlyList<UpgradeConflictResolution> resolutions, UpgradeActor actor, CancellationToken ct = default)
        {
            var checkout = await LoadWorkingAsync(id, ct);
            if (checkout.PullRequestId is not int pr) throw new UpgradeException("Det finns inget att slå ihop.");
            foreach (var r in resolutions)
                await _git.ResolveConflictAsync(pr, r.ConflictId, UpgradeDocumentFormat.Normalize(r.Content ?? ""), ct);
            Log(checkout, actor, $"Slog ihop {resolutions.Count} sidor med wikins ändringar.");
            return await TryMergeAsync(checkout, actor, Array.Empty<string>(), ct);
        }

        public async Task CancelAsync(string id, UpgradeActor actor, CancellationToken ct = default)
        {
            var checkout = await LoadWorkingAsync(id, ct);
            if (checkout.PullRequestId is int pr) await _git.AbandonPullRequestAsync(pr, ct);
            await _git.DeleteBranchAsync(checkout.Branch, ct);
            checkout.Status = UpgradeCheckoutStatus.Cancelled;
            checkout.ClosedAt = DateTimeOffset.UtcNow;
            Log(checkout, actor, "Avbruten – ändringarna kastades.");
            await _repository.SaveAsync(checkout, ct);
        }

        /// <summary>An image from the wiki's /.attachments, for rendering pages in the board.</summary>
        public async Task<(byte[] Bytes, string ContentType)?> GetAttachmentAsync(string path, CancellationToken ct = default)
        {
            if (!path.StartsWith("/.attachments/", StringComparison.Ordinal) || path.Contains("..", StringComparison.Ordinal))
                throw new UpgradeException("Bara bilder under /.attachments kan hämtas.");
            return await _git.GetFileBytesAsync(path, Master, ct);
        }

        // ---------------------------------------------------------------- helpers

        private async Task<UpgradeSubmitResult> TryMergeAsync(UpgradeCheckout checkout, UpgradeActor actor, IReadOnlyList<string> changedTitles, CancellationToken ct)
        {
            var pr = await _git.WaitForMergeStatusAsync(checkout.PullRequestId!.Value, ct);
            if (pr.MergeStatus == "conflicts")
            {
                checkout.Status = UpgradeCheckoutStatus.Conflict;
                var conflicts = await LoadConflictsAsync(checkout, pr.Id, ct);
                Log(checkout, actor, $"Lämnade in – {conflicts.Count} sidor har ändrats i wikin på samma ställe och behöver slås ihop.");
                await _repository.SaveAsync(checkout, ct);
                return new UpgradeSubmitResult("Conflict",
                    "Någon har ändrat samma ställe i wikin sedan du checkade ut. Slå ihop ändringarna nedan och lämna in igen.",
                    conflicts);
            }
            if (pr.MergeStatus != "succeeded")
                throw new UpgradeException($"Wikin kunde inte ta emot ändringarna (status: {pr.MergeStatus}). Försök igen om en stund.", 502);

            var mergeCommit = await _git.CompletePullRequestAsync(pr.Id, CommitMessage(checkout), ct);
            checkout.Status = UpgradeCheckoutStatus.Merged;
            checkout.MergedCommit = mergeCommit ?? await _git.GetBranchHeadAsync(_settings.Branch, ct);
            checkout.ClosedAt = DateTimeOffset.UtcNow;
            Log(checkout, actor, changedTitles.Count > 0
                ? $"Uppdaterad i wikin: {string.Join(", ", changedTitles)}."
                : "Uppdaterad i wikin.");
            await _repository.SaveAsync(checkout, ct);
            return new UpgradeSubmitResult("Merged", "Wikin är uppdaterad med dina ändringar.", Array.Empty<UpgradeConflictDto>());
        }

        private async Task<IReadOnlyList<UpgradeConflictDto>> LoadConflictsAsync(UpgradeCheckout checkout, int pr, CancellationToken ct)
        {
            var conflicts = await _git.GetConflictsAsync(pr, ct);
            var result = new List<UpgradeConflictDto>();
            foreach (var c in conflicts)
            {
                var section = checkout.Sections.FirstOrDefault(s => s.Path == c.Path);
                async Task<string> At(string? commit) => commit is null ? "" : await _git.GetFileTextAsync(c.Path, WikiGitVersion.OfCommit(commit), ct) ?? "";
                result.Add(new UpgradeConflictDto(
                    c.ConflictId,
                    section is null ? c.Path : IdOf(section.Path),
                    section?.Title ?? WikiPathCodec.TitleOf(c.Path),
                    section?.Release ?? "",
                    await At(c.BaseCommit ?? checkout.BaseCommit),
                    await At(c.TargetCommit),
                    await At(c.SourceCommit)));
            }
            return result;
        }

        private async Task<UpgradeCheckout> LoadAsync(string id, CancellationToken ct) =>
            await _repository.GetAsync(id, ct) ?? throw new UpgradeException($"Utcheckningen {id} finns inte.", 404);

        private async Task<UpgradeCheckout> LoadWorkingAsync(string id, CancellationToken ct)
        {
            var checkout = await LoadAsync(id, ct);
            if (checkout.Status is not (UpgradeCheckoutStatus.Active or UpgradeCheckoutStatus.Conflict))
                throw new UpgradeException("Utcheckningen är redan avslutad.", 409);
            return checkout;
        }

        private UpgradeCheckoutSection FindSection(UpgradeCheckout checkout, string sectionId) =>
            checkout.Sections.FirstOrDefault(s => IdOf(s.Path) == sectionId)
            ?? throw new UpgradeException($"Sidan {sectionId} ingår inte i utcheckningen.");

        private static string CommitMessage(UpgradeCheckout c) =>
            $"Uppgradering {c.Customer} – {c.Product} {string.Join(", ", c.Releases)} (utcheckning {c.Id})";

        private static bool SameText(string a, string b) =>
            UpgradeDocumentFormat.Normalize(a) == UpgradeDocumentFormat.Normalize(b);

        private static void Log(UpgradeCheckout c, UpgradeActor actor, string text)
        {
            c.UpdatedAt = DateTimeOffset.UtcNow;
            c.History.Add(new UpgradeCheckoutEvent { At = c.UpdatedAt, By = actor.Name, Text = text });
        }

        private static UpgradeCheckoutSummaryDto ToSummary(UpgradeCheckout c) => new(
            c.Id, c.Customer, c.Product, c.Releases, c.Status.ToString(), c.CreatedByName, c.CreatedByEmail,
            c.CreatedAt, c.UpdatedAt, c.Sections.Count);

        private static string NewId() => Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();

        /// <summary>"Kund AB, Ånge" → "kund-ab-ange" - safe in a branch name and a file name.</summary>
        internal static string Slug(string text)
        {
            var decomposed = text.ToLowerInvariant().Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var ch in decomposed)
            {
                if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
                sb.Append(char.IsAsciiLetterOrDigit(ch) ? ch : '-');
            }
            var slug = Regex.Replace(sb.ToString(), "-{2,}", "-").Trim('-');
            return slug.Length == 0 ? "kund" : slug.Length > 40 ? slug[..40].TrimEnd('-') : slug;
        }
    }
}
