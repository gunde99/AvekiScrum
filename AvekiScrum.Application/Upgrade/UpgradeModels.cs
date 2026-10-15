using System;
using System.Collections.Generic;

namespace AvekiScrum.Application.Upgrade
{
    /// <summary>Who is doing something - the signed-in user, or the name typed in PAT mode.</summary>
    public sealed record UpgradeActor(string Name, string Email);

    /// <summary>A failure with a message meant for the consultant, and the HTTP status to answer with.</summary>
    public sealed class UpgradeException : Exception
    {
        public int StatusCode { get; }
        public UpgradeException(string message, int statusCode = 400) : base(message) => StatusCode = statusCode;
    }

    public sealed record UpgradeStructureDto(string Commit, IReadOnlyList<UpgradeProductDto> Products);

    public sealed record UpgradeProductDto(string Name, IReadOnlyList<UpgradeReleaseDto> Releases);

    public sealed record UpgradeReleaseDto(string Name, IReadOnlyList<UpgradePageDto> Pages);

    /// <param name="Id">Path relative to the configured root, e.g. "VA%2Dbanken/2026.2/VA%2Dtrans.md".</param>
    /// <param name="Always">The page applies to every customer ("Gäller: Alla kunder") - always included.</param>
    public sealed record UpgradePageDto(string Id, string Title, string AppliesTo, bool Always);

    public sealed record CreateUpgradeCheckoutRequest(string Customer, string Product, IReadOnlyList<string> Releases, IReadOnlyList<string> Modules);

    public sealed record UpgradeCheckoutSummaryDto(
        string Id,
        string Customer,
        string Product,
        IReadOnlyList<string> Releases,
        string Status,
        string CreatedByName,
        string CreatedByEmail,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt,
        int SectionCount);

    public sealed record UpgradeSectionDto(
        string Id,
        string Release,
        string Title,
        string AppliesTo,
        string Content,
        // Differs from what was checked out - will be written back on "Lämna in".
        bool Changed,
        // Someone has changed the page in the wiki since this checkout was made.
        bool WikiChanged,
        // Bockad som klar av konsulten - bara en checklista, aldrig till wikin.
        bool Completed = false);

    public sealed record UpgradeHistoryDto(DateTimeOffset At, string By, string Text);

    public sealed record UpgradeCheckoutDetailDto(
        UpgradeCheckoutSummaryDto Summary,
        string HeadCommit,
        IReadOnlyList<UpgradeSectionDto> Sections,
        IReadOnlyList<UpgradeHistoryDto> History,
        IReadOnlyList<UpgradeConflictDto> Conflicts);

    public sealed record SaveUpgradeSectionRequest(string SectionId, string Content, string ExpectedHead);

    public sealed record SaveUpgradeSectionResult(string HeadCommit, bool Changed);

    public sealed record SetUpgradeSectionCompletedRequest(string SectionId, bool Completed);

    public sealed record UpgradeImportResult(
        bool Ok,
        IReadOnlyList<string> Errors,
        IReadOnlyList<string> Warnings,
        IReadOnlyList<string> Applied,
        IReadOnlyList<string> SkippedChangedSince,
        IReadOnlyList<string> Unknown,
        string HeadCommit);

    /// <summary>One page where the wiki and the consultant changed the same place.</summary>
    public sealed record UpgradeConflictDto(int ConflictId, string SectionId, string Title, string Release, string Base, string Wiki, string Mine);

    public sealed record UpgradeSubmitResult(string Status, string Message, IReadOnlyList<UpgradeConflictDto> Conflicts);

    public sealed record UpgradeConflictResolution(int ConflictId, string Content);
}
