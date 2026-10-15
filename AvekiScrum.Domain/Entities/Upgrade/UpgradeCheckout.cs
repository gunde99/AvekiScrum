using System;
using System.Collections.Generic;

namespace AvekiScrum.Domain.Entities.Upgrade
{
    /// <summary>
    /// One consultant's upgrade of one customer: which releases and modules were picked, and the
    /// wiki-repo branch holding their working copy. Only metadata lives here - the document itself is
    /// the branch (base = BaseCommit, revisions = its git history). See UPGRADERINGSDOKUMENTATION_SPEC.md §0.
    /// </summary>
    public sealed class UpgradeCheckout
    {
        public string Id { get; set; } = "";
        public string Customer { get; set; } = "";
        public string Product { get; set; } = "";

        /// <summary>Oldest first - the order the sections are done in when a customer skips releases.</summary>
        public List<string> Releases { get; set; } = new();

        /// <summary>The module (page) titles the consultant ticked, "Alla kunder"-pages included.</summary>
        public List<string> Modules { get; set; } = new();

        /// <summary>Frozen at checkout, so later changes to the wiki's page tree can't reshuffle an
        /// upgrade that's already under way.</summary>
        public List<UpgradeCheckoutSection> Sections { get; set; } = new();

        public string Branch { get; set; } = "";
        public string BaseCommit { get; set; } = "";

        /// <summary>The branch head after our last save - the expected head for the next one.</summary>
        public string HeadCommit { get; set; } = "";

        public string CreatedByName { get; set; } = "";
        public string CreatedByEmail { get; set; } = "";
        public DateTimeOffset CreatedAt { get; set; }
        public DateTimeOffset UpdatedAt { get; set; }

        public UpgradeCheckoutStatus Status { get; set; } = UpgradeCheckoutStatus.Active;

        /// <summary>The PR behind "Lämna in" - an implementation detail, never shown as a PR.</summary>
        public int? PullRequestId { get; set; }

        public string? MergedCommit { get; set; }
        public DateTimeOffset? ClosedAt { get; set; }

        public List<UpgradeCheckoutEvent> History { get; set; } = new();

        /// <summary>Sektioner (wikisidornas sökvägar) som konsulten har bockat av som klara under
        /// uppgraderingen. En egen checklista - följer aldrig med tillbaka till wikin.</summary>
        public List<string> CompletedSections { get; set; } = new();
    }

    public sealed class UpgradeCheckoutSection
    {
        public string Release { get; set; } = "";
        public string Title { get; set; } = "";

        /// <summary>The page's git path in the wiki repo, e.g. ".../Labday-POC/VA%2Dbanken/2026.2/VA%2Dtrans.md".</summary>
        public string Path { get; set; } = "";

        /// <summary>The page's "Gäller" line, for display.</summary>
        public string AppliesTo { get; set; } = "";
    }

    public sealed class UpgradeCheckoutEvent
    {
        public DateTimeOffset At { get; set; }
        public string By { get; set; } = "";
        public string Text { get; set; } = "";
    }

    public enum UpgradeCheckoutStatus
    {
        /// <summary>Being worked on - the branch exists.</summary>
        Active,

        /// <summary>Submitted, but the wiki changed in the same place - waiting for the consultant to merge.</summary>
        Conflict,

        /// <summary>The changes are in the wiki; the branch is gone.</summary>
        Merged,

        /// <summary>Submitted with nothing changed - closed without touching the wiki.</summary>
        ClosedUnchanged,

        /// <summary>Cancelled by the consultant; the branch is gone.</summary>
        Cancelled,
    }
}
