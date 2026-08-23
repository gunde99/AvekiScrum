using System;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    /// <summary>
    /// One node in the project's iteration tree, with the dates Azure keeps on it.
    ///
    /// Deliberately not <see cref="Sprint"/>: that comes from the team-settings endpoint and only
    /// knows the iterations a given team has subscribed to, which means it needs a team to exist
    /// with exactly the expected name. This reads the project's own classification nodes instead,
    /// so it works the same in a sandbox project that has no teams set up at all.
    /// </summary>
    /// <param name="Path">Project-qualified, in the same shape as System.IterationPath.</param>
    /// <param name="HasChildren">False for a sprint; true for a folder like "v27.1".</param>
    public sealed record IterationNodeDto(
        string Path,
        string Name,
        DateTime? StartDate,
        DateTime? FinishDate,
        bool HasChildren);
}
