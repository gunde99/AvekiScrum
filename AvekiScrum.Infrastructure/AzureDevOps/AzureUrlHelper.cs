using Microsoft.TeamFoundation.Build.WebApi;
using Microsoft.TeamFoundation.WorkItemTracking.Process.WebApi.Models.Process;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Windows.Forms;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Models.DTOs.Developer;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Infrastructure.AzureDevOps
{
    /// <summary>
    /// UrlHelper för att generera Azure DevOps API‐URL:er. Alla url:er är relativa Azures basUrl (https://dev.azure.com/). Förutsätter att Initialize() har anropats. 
    /// </summary>
    internal class AzureUrlHelper
    {
        //private string BaseUrl = "Aveki/Utveckling/";
        private const string _apiVersion = "api-version=7.1";

        private static string _baseUrl;
        public static string BaseUrl => _baseUrl ?? throw new InvalidOperationException("AzureUrlHelper is not initialized.");

        public static void Initialize(string organisation, string project)
        {
            if (string.IsNullOrWhiteSpace(organisation))
                throw new ArgumentException("organisation cannot be null or empty.");

            if (string.IsNullOrWhiteSpace(project))
                throw new ArgumentException("project cannot be null or empty.");

            if (_baseUrl != null)
                throw new InvalidOperationException("AzureUrlHelper is already initialized.");

            _baseUrl = $"{organisation}/{project}/";
        }

        private static string TeamUrl(DeveloperTeam team)
        {
            return team.GetMetadata()?.TeamUrl ?? throw new ArgumentException("Unknown team: " + team.ToString());
            //switch (team)
            //{
            //    case DeveloperTeam.Nord:
            //        return "Team%20Nord";
            //    case DeveloperTeam.Syd:
            //        return "Team%20Syd";
            //    default:
            //        throw new ArgumentException("Unknown team: " + team.ToString());
            //};
        }

        public static string GetSprintsUrl(DeveloperTeam team)
        {
            return $"{BaseUrl}{TeamUrl(team)}/_apis/work/teamsettings/iterations?{_apiVersion}";
        }

        public static string GetSprintUrl(DeveloperTeam team, string sprint)
        {
            return $"{BaseUrl}{TeamUrl(team)}/_apis/work/teamsettings/iterations/{sprint}?{_apiVersion}";
        }

        public static string GetWiqlUrl()
        {
            return $"{BaseUrl}_apis/wit/wiql?{_apiVersion}&timePrecision=true";
        }

        public static string GetWorkItemDetailsUrl(int workItemId)
        {
            return $"{BaseUrl}_apis/wit/workitems/{workItemId}?{_apiVersion}";
        }

        public static string GetWorkItemPatchUrl(int workItemId)
        {
            return $"{BaseUrl}_apis/wit/workitems/{workItemId}?{_apiVersion}";
        }

        public static string GetCreateWorkItemUrl(string workItemType)
        {
            return $"{BaseUrl}_apis/wit/workitems/${Uri.EscapeDataString(workItemType)}?{_apiVersion}";
        }

        public static string GetWorkItemDetailsWithRelationsUrl(int workItemId)
        {
            return $"{BaseUrl}_apis/wit/workitems/{workItemId}?$expand=relations&{_apiVersion}";
            //return $"Aveki/_apis/wit/workitems/{workItemId}?$expand=relations&api-version=7.0";
        }

        public static string GetWorkItemsDetailsPostUrl()
        {
            return $"{BaseUrl}_apis/wit/workitemsbatch?{_apiVersion}";
        }

        public static string GetWorkItemsDetailsUrl(IEnumerable<int> ids, string fields)
        {
            var idsParam = string.Join(",", ids);
            return $"{BaseUrl}_apis/wit/workitems?ids={idsParam}&fields={fields}&{_apiVersion}";
        }



        internal static string GetWorkItemDetailsUrl(int workItemId, string fields)
        {
            // Exempel: https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{id}?$expand=Relations&fields=...
            return $"{BaseUrl}_apis/wit/workitems/{workItemId}?expand=Relations&fields={fields}&{_apiVersion}";
        }

        public static string GetWorkItemUpdatesUrl(int workItemId, List<string> parameters)
        {
            return $"{BaseUrl}_apis/wit/workItems/{workItemId}/updates?{string.Join("&", parameters)}&{_apiVersion}";
        }

        public static string GetTestPlanPointsUrl(int planId, int suiteId, int skip, int top)
        {
            return $"{BaseUrl}_apis/test/Plans/{planId}/Suites/{suiteId}/points" +
                   $"?includePointDetails=true&$skip={skip}&$top={top}&{_apiVersion}";
        }

        public static string GetTestPlanPointsUrl(int planId, int suiteId, string continuationToken, bool isRecursive)
        {
            var url = $"{BaseUrl}_apis/testplan/Plans/{planId}/Suites/{suiteId}/TestPoint" +
                      $"?includePointDetails=true&isRecursive={isRecursive.ToString().ToLowerInvariant()}&{_apiVersion}";

            if (!string.IsNullOrWhiteSpace(continuationToken))
                url += $"&continuationToken={Uri.EscapeDataString(continuationToken)}";

            return url;
        }

        public static string GetTestPlanSuitesUrl(int planId)
        {
            return $"{BaseUrl}_apis/testplan/Plans/{planId}/suites?expand=Children&asTreeView=true&{_apiVersion}";
        }

        public static string GetTestPlanSuiteUrl(int planId, int suiteId)
        {
            return $"{BaseUrl}_apis/testplan/Plans/{planId}/suites/{suiteId}?expand=Children&{_apiVersion}";
        }

        public static string GetQueriesUrl(string folderPath)
        {
            return $"{BaseUrl}_apis/wit/queries/{Uri.EscapeDataString(folderPath)}?{_apiVersion}&$depth=2&includeQueryText=true";
        }

        public static string GetQueryDetailsUrl(string queryId)
        {
            return $"{BaseUrl}_apis/wit/queries/{queryId}?{_apiVersion}";
        }

        public static string GetReposUrl()
        {
            return $"{BaseUrl}_apis/git/repositories?{_apiVersion}";
        }

        public static string GetRepoItemsUrl(string repoId, string branch)
        {
            return $"{BaseUrl}_apis/git/repositories/{repoId}/items" +
                               $"?recursionLevel=Full&versionDescriptor.version={branch}&{_apiVersion}";
        }

        private static string encodeWikiPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return "/";

            var segments = path.Split('/');
            var encodedSegments = segments.Select(s =>
                string.IsNullOrEmpty(s) ? s : Uri.EscapeDataString(s));

            return string.Join("/", encodedSegments);
        }

        public static string GetWikiUrl()
        {
            return $"{BaseUrl}_apis/wiki/wikis?{_apiVersion}";
        }

        public static string GetWikiPageUrl(string wikiIdOrName, string wikiPath, bool includeContent, int? version)
        {
            var qp = HttpUtility.ParseQueryString(string.Empty);
            if (includeContent) qp["includeContent"] = "true";
            if (version.HasValue) qp["versionDescriptor.version"] = version.Value.ToString();
            qp["api-version"] = "7.1";
            //return $"{BaseUrl}_apis/wiki/wikis/{HttpUtility.UrlEncode(wikiIdOrName)}/pages?path={HttpUtility.UrlEncode(path)}&{qp}";

            string encodedPath = encodeWikiPath(wikiPath);
            return $"{BaseUrl}_apis/wiki/wikis/{Uri.EscapeDataString(wikiIdOrName)}/pages?path={encodedPath}&{qp}";      
        }

        public static string GetWikiPageByIdUrl(string wikiIdOrName, int pageId, bool includeContent)
        {
            var qp = HttpUtility.ParseQueryString(string.Empty);
            if (includeContent) qp["includeContent"] = "true";
            qp["api-version"] = "7.1";
            return $"{BaseUrl}_apis/wiki/wikis/{Uri.EscapeDataString(wikiIdOrName)}/pages/{pageId}?{qp}";
        }

        /// <summary>
        /// Same as <see cref="GetWikiPageByIdUrl(string, int, bool)"/> but for a wiki that lives in a
        /// different organisation/project than this app's configured default (e.g. a team's sprint-goals
        /// wiki page living in a different ADO project) - builds the base path explicitly instead of
        /// using the statically-initialized <see cref="BaseUrl"/>.
        /// </summary>
        public static string GetWikiPageByIdUrl(string organization, string project, string wikiIdOrName, int pageId, bool includeContent)
        {
            var qp = HttpUtility.ParseQueryString(string.Empty);
            if (includeContent) qp["includeContent"] = "true";
            qp["api-version"] = "7.1";
            return $"{Uri.EscapeDataString(organization)}/{Uri.EscapeDataString(project)}/_apis/wiki/wikis/{Uri.EscapeDataString(wikiIdOrName)}/pages/{pageId}?{qp}";
        }

        public static string GetWikiPagesUrl(string wikiId)
        {
            return $"{BaseUrl}_apis/wiki/wikis/{wikiId}/pages?recursionLevel=Full&{_apiVersion}";
        }

        public static string GetWikiPagesUrl(string wikiId, string wikiPath)
        {
            string encodedPath = encodeWikiPath(wikiPath);
            return $"{BaseUrl}_apis/wiki/wikis/{wikiId}/pages?path={encodedPath}&recursionLevel=Full&{_apiVersion}";
        }

        public static string GetWikiPagesContentUrl(string wikiId, string wikiPath)
        {
            string encodedPath = encodeWikiPath(wikiPath);
            return $"{BaseUrl}_apis/wiki/wikis/{wikiId}/pages?path={encodedPath}&includeContent=true&{_apiVersion}";
        }

        public static string PutWikiPageUrl(string wikiIdOrName, string wikiPath, string? comment)
        {
            var qp = HttpUtility.ParseQueryString(string.Empty);
            if (!string.IsNullOrWhiteSpace(comment)) qp["comment"] = comment;
            qp["api-version"] = "7.1";
            string encodedPath = encodeWikiPath(wikiPath);
            return $"{BaseUrl}_apis/wiki/wikis/{Uri.EscapeDataString(wikiIdOrName)}/pages?path={encodedPath}&{qp}";
        }

        public static string DeleteWikiPageUrl(string wikiIdOrName, string wikiPath)
            => $"{BaseUrl}_apis/wiki/wikis/{Uri.EscapeDataString(wikiIdOrName)}/pages?path={encodeWikiPath(wikiPath)}&api-version=7.1";

        public static string SearchWikiUrl(string wikiIdOrName, string searchText)
            => $"{BaseUrl}_apis/wiki/wikis/{Uri.EscapeDataString(wikiIdOrName)}/search?searchText={Uri.EscapeDataString(searchText)}&{_apiVersion}";

        public static string GetTeamMembersUrl(string teamName)
        {
            string encodedTeamName = Uri.EscapeDataString(teamName);
            return $"{BaseUrl}/_apis/teams/{encodedTeamName}/members?{_apiVersion}";
        }

        public static string GetWorkItemAttachmentUrl(Guid attachmentId, string? fileName)
        {
            var fn = string.IsNullOrWhiteSpace(fileName) ? "" : $"&fileName={Uri.EscapeDataString(fileName)}";
            return $"{BaseUrl}_apis/wit/attachments/{attachmentId:D}?{_apiVersion}{fn}";
        }

        public static string GetWorkItemAttachmentUploadUrl(string fileName)
        {
            return $"{BaseUrl}_apis/wit/attachments?fileName={Uri.EscapeDataString(fileName)}&uploadType=Simple&{_apiVersion}";
        }

        public static string GetWorkItemCommentsUrl(int workItemId)
        {
            return $"{BaseUrl}_apis/wit/workItems/{workItemId}/comments?api-version=7.1-preview.4";
        }

        /// <summary>Area or iteration tree for the project, deep enough to reach every leaf.</summary>
        public static string GetClassificationNodesUrl(string structureGroup)
        {
            return $"{BaseUrl}_apis/wit/classificationnodes/{structureGroup}?$depth=10&{_apiVersion}";
        }

        /// <summary>
        /// One work item type's fields with their allowed values - the picklists the process
        /// template actually defines. The per-field endpoint omits allowedValues, so this
        /// type-scoped list is the only place they come from.
        /// </summary>
        public static string GetWorkItemTypeFieldsUrl(string workItemType)
        {
            return $"{BaseUrl}_apis/wit/workitemtypes/{Uri.EscapeDataString(workItemType)}/fields?$expand=allowedValues&{_apiVersion}";
        }

        /// <summary>Every tag defined in the project, for the tag picker.</summary>
        public static string GetTagsUrl()
        {
            return $"{BaseUrl}_apis/wit/tags?api-version=7.1-preview.1";
        }

        public static string GetWorkItemRevisionsUrl(int workItemId)
        {
            return $"{BaseUrl}_apis/wit/workItems/{workItemId}/revisions?expand=fields&{_apiVersion}";
        }

        public static string GetRepositoriesUrl()
        {
            return $"{BaseUrl}_apis/git/repositories?{_apiVersion}";
        }

        public static string GetPullRequestsUrl(string repoId)
        {
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests?searchCriteria.status=active&{_apiVersion}";
        }

        public static string GetPullRequestsUrl(PullRequestOptions prOptions)
        {
            return $"{BaseUrl}/_apis/git/repositories/{Uri.EscapeDataString(prOptions.RepositoryIdOrName)}/pullrequests" +
                $"?searchCriteria.status={prOptions.Status}" +
                $"&searchCriteria.minTime={Uri.EscapeDataString(prOptions.From.UtcDateTime.ToString("o"))}" +
                $"&searchCriteria.maxTime={Uri.EscapeDataString(prOptions.To.UtcDateTime.ToString("o"))}" +
                $"&$top={prOptions.Top}" +
                $"&{_apiVersion}";
        }

        public static string GetPullRequestThreadssUrl(string repositoryIdOrName, string pullRequestId)
        {
            return $"{BaseUrl}_apis/git/repositories/{Uri.EscapeDataString(repositoryIdOrName)}/pullrequests/{pullRequestId}/threads?{_apiVersion}";
        }

        public static string GetPullRequestDetailsUrl(string repoId, int pullRequestId)
        {
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests/{pullRequestId}?{_apiVersion}";
        }

        //pr changes
        public static string GetPullRequestChangesUrl(string repoId, int pullRequestId)
        {
            //https://dev.azure.com/Aveki/Utveckling//_apis/git/repositories/ae0d4b7b-1aa0-4943-b269-ad38fdecf163/pullrequests/3816/changes?api-version=7.0
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests/{pullRequestId}/changes?{_apiVersion}";
        }

        public static string GetPullRequestIterationChangesUrl(string repoId, int pullRequestId)
        {
            //https://dev.azure.com/Aveki/Utveckling//_apis/git/repositories/ae0d4b7b-1aa0-4943-b269-ad38fdecf163/pullrequests/3816/changes?api-version=7.0
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests/{pullRequestId}/changes?{_apiVersion}";
        }

        public static string GetFileContentAtCommitUrl(string repoId, string filePath, string commitId)
        {
            // Viktigt: versionDescriptor.versionType=commit annars tolkas version som branch/tag
            string path = Uri.EscapeDataString(filePath);

            // $format=text ger ren text (bra för .cs, .json etc). Behövs ej, men undviker base64/binary i vissa fall.
            var url = $"{BaseUrl}/_apis/git/repositories/{repoId}/items" +
                      $"?path={path}" +
                      $"&versionDescriptor.version={commitId}" +
                      $"&versionDescriptor.versionType=commit" +
                      $"&includeContent=true" +
                      $"&resolveLfs=true" +
                      $"&$format=text" +
                      $"&api-version=7.1-preview.1";
            return url;
        }

        public static string GetFileContentAtCommitFallbackUrl(string repoId, string filePath, string commitId)
        {
            // Viktigt: versionDescriptor.versionType=commit annars tolkas version som branch/tag
            string path = Uri.EscapeDataString(filePath);

            // $format=text ger ren text (bra för .cs, .json etc). Behövs ej, men undviker base64/binary i vissa fall.
            var url = $"{BaseUrl}/_apis/git/repositories/{repoId}/items" +
                            $"?path={path}" +
                            $"&versionDescriptor.version={commitId}" +
                            $"&versionDescriptor.versionType=commit" +
                            $"&download=true" +
                            $"&{_apiVersion}";
            return url;
        }

        //pr iterations
        public static string GetPullRequestIterationsUrl(string repoId, int pullRequestId)
        {
            //https://dev.azure.com/Aveki/Utveckling/_apis/git/repositories/ae0d4b7b-1aa0-4943-b269-ad38fdecf163/pullrequests/3816/iterations?api-version=7.0
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests/{pullRequestId}/iterations?{_apiVersion}";
        }
        //pr iterations changes
        public static string GetPullRequestIterationChangesUrl(string repoId, int pullRequestId, int iterationId)
        {
            //https://dev.azure.com/Aveki/Utveckling/_apis/git/repositories/ae0d4b7b-1aa0-4943-b269-ad38fdecf163/pullrequests/3816/iterations/1/changes?api-version=7.0
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests/{pullRequestId}/iterations/{iterationId}/changes?{_apiVersion}";
        }

        // Get comments for a pull request
        public static string GetPullRequestCommentsUrl(string repoId, int pullRequestId)
        {
            return $"{BaseUrl}_apis/git/repositories/{repoId}/pullrequests/{pullRequestId}/threads?{_apiVersion}";
        }

        //diffs between commits
        public static string GetDiffsBetweenCommitsUrl(string repoId, string baseCommitId, string targetCommitId)
        {
            //https://dev.azure.com/Aveki/Utveckling/_apis/git/repositories/ae0d4b7b-1aa0-4943-b269-ad38fdecf163/diffs/commits?baseVersion=main&targetVersion=refs/heads/feature/WO-1234-new-feature&api-version=7.0
            
            return $"{BaseUrl}_apis/git/repositories/{repoId}/diffs/commits?baseVersion={baseCommitId}&targetVersion={targetCommitId}&{_apiVersion}";
        }
    }
}
