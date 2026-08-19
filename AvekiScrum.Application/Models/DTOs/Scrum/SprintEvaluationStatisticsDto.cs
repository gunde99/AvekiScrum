using System;
using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    /// <summary>
    /// Håller all statistik som motsvarar dina två PPT-bilder.
    /// </summary>
    public class SprintEvaluationStatisticsDto
    {
        // --- Bild 1: Fördelning av story points per status ---

        public int NotStartedStoryPoints { get; set; }   // "Ej påbörjade"
        public int ActiveStoryPoints { get; set; }       // "Aktiva"
        public int ResolvedStoryPoints { get; set; }     // "Resolved"
        public int ClosedStoryPoints { get; set; }       // "Closed"

        public int EstimatedStoryPoints =>
            NotStartedStoryPoints + ActiveStoryPoints + ResolvedStoryPoints + ClosedStoryPoints;

        /// <summary>
        /// Det du kallar "Levererat (Closed)"
        /// </summary>
        public int DeliveredStoryPoints => ClosedStoryPoints;

        /// <summary>
        /// Levererat - uppskattat (kommer sannolikt vara negativt).
        /// </summary>
        public int VarianceStoryPoints => DeliveredStoryPoints - EstimatedStoryPoints;

        public double VariancePercent =>
            EstimatedStoryPoints == 0
                ? 0.0
                : Math.Round((double)VarianceStoryPoints / EstimatedStoryPoints * 100, 1);

        public int UserStoryCount { get; set; }
        public int BugCount { get; set; }

        // --- Bild 2: Sprintplanering / Tillkom under sprinten / Klart ---

        /// <summary>
        /// Antal US i respektive kategori (planerat, tillkom, klart).
        /// </summary>
        public SprintScopeStats UserStoryStats { get; set; } = new();

        /// <summary>
        /// Antal buggar i respektive kategori.
        /// </summary>
        public SprintScopeStats BugStats { get; set; } = new();

        /// <summary>
        /// Story points (US + buggar) i respektive kategori.
        /// </summary>
        public SprintScopeStats StoryPointStats { get; set; } = new();

        // Kommentar, sprintnamn etc (om du vill visa det i PPT/textfil).
        public string SprintName { get; set; }
        public string Comment { get; set; }
    }

    /// <summary>
    /// Återanvänds både för antal och för story points.
    /// Planned = "Sprintplanering", Added = "Tillkom under sprinten", Done = "Klart".
    /// </summary>
    public class SprintScopeStats
    {
        /// <summary>
        /// Det som fanns innan sprintstart (planerat i sprinten).
        /// </summary>
        public int Planned { get; set; }

        /// <summary>
        /// Det som tillkom under sprintens gång (skapades efter sprintstart).
        /// </summary>
        public int AddedDuringSprint { get; set; }

        /// <summary>
        /// Det som blev klart under sprinten (ClosedDate i intervallet).
        /// </summary>
        public int Done { get; set; }
    }
}
