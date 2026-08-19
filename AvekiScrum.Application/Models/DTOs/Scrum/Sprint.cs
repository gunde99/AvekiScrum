using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    public class Sprint
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string Path { get; set; }
        public bool IsCurrent { get; set; }

        //public List<WorkItem> WorkItems { get; set; }

        public override string ToString()
        {
            if (IsCurrent)
            {
                return $"{Name} {{Id}} ({StartDate}-{EndDate}) <= Aktuell sprint";
            }
            else
                return $"{Name} {{Id}} ({StartDate}-{EndDate})";
        }

        public DateTime ReviewDate(DeveloperTeam team)
        {
            // Nuvarande planering: sprint review sker på torsdagar i sista veckan för Syd och på fredagar i sista veckan för Nord
            if (team == DeveloperTeam.Syd)
            {
                //Ta reda på veckan för EndDate
                var endWeek = System.Globalization.CultureInfo.CurrentCulture.Calendar.GetWeekOfYear(EndDate, System.Globalization.CalendarWeekRule.FirstFourDayWeek, DayOfWeek.Monday);
                //Ta reda på vilken dag som är torsdag i den veckan
                var reviewDate = System.Globalization.CultureInfo.CurrentCulture.Calendar.AddDays(EndDate, -((int)EndDate.DayOfWeek - (int)DayOfWeek.Thursday + 7) % 7);
                return reviewDate;
            }
            else if (team == DeveloperTeam.Nord)
            {
                //Ta reda på veckan för EndDate
                var endWeek = System.Globalization.CultureInfo.CurrentCulture.Calendar.GetWeekOfYear(EndDate, System.Globalization.CalendarWeekRule.FirstFourDayWeek, DayOfWeek.Monday);
                //Ta reda på vilken dag som är fredag i den veckan
                var reviewDate = System.Globalization.CultureInfo.CurrentCulture.Calendar.AddDays(EndDate, -((int)EndDate.DayOfWeek - (int)DayOfWeek.Friday + 7) % 7);
                return reviewDate;
            }
            else
            {
                throw new ArgumentException("Ogiltigt team. Förväntat 'Syd' eller 'Nord'.");
            }
        }
    }
}
