namespace AvekiScrum.Application.Configuration
{
    public class SprintGoalsWikiUrlSettings
    {
        /// <summary>Where the override file lives, relative to the content root unless rooted. Same
        /// "no database yet" rationale as DailyCheckInSettings/TalkingPointSettings.</summary>
        public string DataDirectory { get; set; } = "App_Data/sprint-goals-wiki-urls";
    }
}
