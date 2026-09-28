namespace AvekiScrum.Application.Configuration
{
    public class TalkingPointSettings
    {
        /// <summary>
        /// Where the per-team talking-point files live, relative to the content root unless rooted.
        /// One small JSON file per team - see JsonFileTalkingPointRepository. Same "no database yet"
        /// rationale as DailyCheckInSettings.
        /// </summary>
        public string DataDirectory { get; set; } = "App_Data/talking-points";
    }
}
