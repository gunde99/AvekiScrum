using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AvekiScrum.Domain.Entities.Scrum
{
    public class DailyCheckIn
    {
        public int Id { get; set; }
        public string TeamName { get; set; } = null!;
        public string DeveloperName { get; set; } = null!;
        public DateTime Date { get; set; }
        public int MoodRating { get; set; }   // 1-5 skala
    }

}
