namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class WorkItemQuery
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Wiql { get; set; }
        public bool IsFolder { get; set; }

        public override string ToString()
        {
            if (IsFolder)
            {
                return $"{Name} {{Id}} <= Folder";
            }
            else
            {
                return $"{Name} {{Id}} wiql: {Wiql}";
            }
        }
    }
}
