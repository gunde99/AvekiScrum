using System;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class RepoTestSnapshot
    {
        public int Id { get; set; }
        public string RepositoryName { get; set; }
        public int TotalProjects { get; set; }
        public int TestProjects { get; set; }
        public DateTime SnapshotDate { get; set; }
    }
}
