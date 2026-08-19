namespace AvekiScrum.Application.Models.DTOs
{
    public class RepoTestScanResult
    {
        public string RepositoryName { get; set; }
        public int TotalProjects { get; set; }
        public int TestProjects { get; set; }
        public bool HasTests => TestProjects > 0;

        public override string ToString()
        {
            return $"{RepositoryName} - Total Projects: {TotalProjects}, Test Projects: {TestProjects}";
        }
    }
}
