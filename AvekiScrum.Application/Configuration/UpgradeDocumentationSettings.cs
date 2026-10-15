namespace AvekiScrum.Application.Configuration
{
    /// <summary>
    /// AvekiDokumentation's "Uppgradering" tab - where the upgrade instructions live in the wiki and
    /// where checkout metadata is stored. See docs/Uppgraderingsdokumentation/UPPGRADERINGSDOKUMENTATION_SPEC.md §0.
    /// </summary>
    public class UpgradeDocumentationSettings
    {
        /// <summary>The Azure DevOps project that owns the wiki. Independent of AzureDevOps:Project,
        /// so the upgrade docs can live in another project (ScrumLab for the POC).</summary>
        public string Project { get; set; } = "ScrumLab";

        /// <summary>The wiki's git repository name, "&lt;Project&gt;.wiki" for a project wiki.</summary>
        public string Repository { get; set; } = "ScrumLab.wiki";

        /// <summary>The branch the wiki publishes - always "wikiMaster" for a project wiki.</summary>
        public string Branch { get; set; } = "wikiMaster";

        /// <summary>The root folder in the wiki repo, as a git path (the wiki's own file-name encoding:
        /// spaces as '-', '-' as %2D). Its subfolders are the products.</summary>
        public string RootPath { get; set; } = "/Aveki-%2D-under-arbete/Installation-&-uppgradering/Uppgradering/Labday-POC";

        /// <summary>Folders directly under RootPath that are not products (templates and the like).</summary>
        public string[] IgnoredFolders { get; set; } = new[] { "Mallar" };

        /// <summary>Every checkout gets a branch under this prefix.</summary>
        public string BranchPrefix { get; set; } = "uppgradering/";

        /// <summary>Checkout metadata (customer, releases, modules, branch). The documents themselves
        /// live in the wiki repo's branches, not here.</summary>
        public string DataDirectory { get; set; } = "App_Data/upgrade-checkouts";
    }
}
