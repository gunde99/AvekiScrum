using System;
using System.Collections.Generic;

namespace AvekiScrum.Application.Models.DTOs.Scrum
{
    /// <summary>
    /// Representerar en wiki-sidmall.
    /// </summary>
    public sealed class WikiTemplateDto
    {
        public string Key { get; init; } = "";
        public string DisplayName { get; init; } = "";
        public string Description { get; init; } = "";
        public string MarkdownContent { get; init; } = "";

        /// <summary>
        /// Platshållare som ska ersättas, t.ex. {{Datum}}, {{Sprint}}.
        /// </summary>
        public IReadOnlyList<string> Placeholders { get; init; } = Array.Empty<string>();
    }
}
