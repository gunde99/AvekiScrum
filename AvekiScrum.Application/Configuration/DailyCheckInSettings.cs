namespace AvekiScrum.Application.Configuration
{
    public class DailyCheckInSettings
    {
        /// <summary>
        /// Where the per-team check-in files live, relative to the content root unless rooted.
        /// One small JSON file per team - see JsonFileDailyCheckInRepository. No database exists
        /// in this app yet; this is deliberately the simplest thing that can hold a few sprints'
        /// worth of numbers while the retro-facing view around them is designed.
        /// </summary>
        public string DataDirectory { get; set; } = "App_Data/daily-checkins";
    }
}
