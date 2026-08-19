using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading.Tasks;
using AvekiScrum.Application.Models.DTOs;
using AvekiScrum.Application.Models.DTOs.Scrum;
using AvekiScrum.Domain.Entities;
using AvekiScrum.Domain.Entities.Scrum;

namespace AvekiScrum.Application.Mappers
{
    public static class DtoMapper
    {
        /// <summary>
        /// Mappar en SprintCapacityPlan (+ optional förra sprinten) till SprintCapacityPlanDto.
        /// </summary>
        public static SprintCapacityPlanDto ToDto(this SprintCapacityPlan current, SprintCapacityPlan lastSprint = null)
        {
            return new SprintCapacityPlanDto
            {
                Id = current.Id,
                TeamName = current.TeamName,
                DeveloperName = current.DeveloperName,
                IterationPath = current.IterationPath,
                SprintStartDate = current.SprintStartDate,
                SprintEndDate = current.SprintEndDate,
                EstimatedCapacitySP = current.EstimatedCapacitySP,
                PlannedCapacitySP = current.PlannedCapacitySP,
                ActualCapacitySP = current.ActualCapacitySP,

                LastSprintEstimatedCapacitySP = lastSprint?.EstimatedCapacitySP,
                LastSprintPlannedCapacitySP = lastSprint?.PlannedCapacitySP,
                LastSprintActualCapacitySP = lastSprint?.ActualCapacitySP,

                // Kopiera över Leaves direkt – om du hellre vill mappar du även
                // DeveloperLeave till en egen DTO, men här återanvänder vi entiteten:
                Leaves = current.Leaves.ToList()
            };
        }

        /// <summary>
        /// Om du har flera planer och vill mappa alla med hjälp av en uppslags‐lista
        /// av förra sprint‐planer (keyed på DeveloperName), kan du göra så här:
        /// </summary>
        public static List<SprintCapacityPlanDto> ToDtoList(this IEnumerable<SprintCapacityPlan> currents, IDictionary<string, SprintCapacityPlan> lastSprintByDeveloper)
        {
            return currents
                .Select(c => c.ToDto(
                    lastSprintByDeveloper.TryGetValue(c.DeveloperName, out var last)
                        ? last
                        : null))
                .ToList();
        }

        //Extension method for ICollection<WorkItemSnapshot> that maps it to List<WorkItemDto>
        public static List<WorkItemDto> ToDtoList(this ICollection<WorkItemSnapshot> snapshots)
        {
            if (snapshots == null)
                return new List<WorkItemDto>();

            return snapshots.Select(w => w.ToDto()).ToList();
        }

        public static WorkItemDto ToDto(this WorkItemSnapshot snapshot)
        {
            if (snapshot == null)
                return null!; // or throw an exception
            return new WorkItemDto
            {
                Id = snapshot.WorkItemId,
                Title = snapshot.Title,
                State = snapshot.State,
                Type = snapshot.WorkItemType,
                AssignedTo = snapshot.AssignedTo,
                StoryPoints = snapshot.StoryPoints,
                AreaPath = snapshot.AreaPath,
                Activity = "",
                AssignedTeam = snapshot.AssignedTeam,
                TypeEnum = AzureEnumMapper.MapType(snapshot.WorkItemType),
                StateEnum = AzureEnumMapper.MapState(snapshot.State)
            };
        }

        /// <summary>
        /// Maps DTOs back to snapshots. You must provide a SprintBoardSnapshotId.
        /// </summary>
        public static List<WorkItemSnapshot> ToSnapshotList(
            this ICollection<WorkItemDto> dtos)
        {
            if (dtos == null)
                return new List<WorkItemSnapshot>();

            return dtos.Select(dto => new WorkItemSnapshot
            {
                WorkItemId = dto.Id,
                Title = dto.Title,
                State = dto.State,
                WorkItemType = dto.Type,
                AssignedTo = dto.AssignedTo,
                StoryPoints = (int)dto.StoryPoints, // if needed, round or truncate
                AreaPath = dto.AreaPath,
                AssignedTeam = dto.AssignedTeam
            }).ToList();
        }

        public static List<WorkItemSnapshot> ToSnapshotList(
            this IReadOnlyList<WorkItemDto> dtos)
        {
            if (dtos == null)
                return new List<WorkItemSnapshot>();
            return dtos.Select(dto => new WorkItemSnapshot
            {
                WorkItemId = dto.Id,
                Title = dto.Title,
                State = dto.State,
                WorkItemType = dto.Type,
                AssignedTo = dto.AssignedTo,
                StoryPoints = (int)dto.StoryPoints, // if needed, round or truncate
                AreaPath = dto.AreaPath,
                AssignedTeam = dto.AssignedTeam
            }).ToList();
        }
    }
}
