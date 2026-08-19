using System.Collections.Generic;

namespace AvekiScrum.Application.Configuration
{
    public class RetroMeetingConfig
    {
        public string WelcomeImagePath { get; set; } = "AvekiImages/aveki.png";
        public string WikiRootPath { get; set; } = "/Aveki - under arbete/Scrum/Scrum Master/Retros";
        public int QuestionCooldownMeetings { get; set; } = 4;
        public Dictionary<string, string> CheckInImageByQuestion { get; set; } = new();
        public List<string> ParticipantRoleKeys { get; set; } = new()
        {
            "DevelopersTeamNord",
            "DevelopersTeamSyd",
            "ProductOwnersTeamNord",
            "ProductOwnersTeamSyd"
        };

        public List<string> CheckInQuestions { get; set; } = new()
        {
            "Om den gångna sprinten var en låt, vilken skulle det vara?",
            "Vilken väderrapport passar bäst för sprinten?",
            "Vilken film- eller serietitel beskriver sprinten bäst?",
            "Vilket ord tar du med dig från sprinten?",
            "Vad i sprinten gav mest energi?",
            "Vad var sprintens största överraskning?"
        };
    }
}
