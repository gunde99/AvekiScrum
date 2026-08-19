using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AvekiScrum.Infrastructure.AzureDevOps.Entities
{
    public class IterationsResponse
    {
        [JsonPropertyName("count")]
        public int Count { get; set; }

        [JsonPropertyName("value")]
        public List<Iteration> Iterations { get; set; } = new();
    }

    public class Iteration
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("path")]
        public string Path { get; set; }

        [JsonPropertyName("attributes")]
        public IterationAttributes Attributes { get; set; }

        [JsonPropertyName("url")]
        public string Url { get; set; }
    }

    public class IterationAttributes
    {
        [JsonPropertyName("startDate")]
        public DateTime StartDate { get; set; }

        [JsonPropertyName("finishDate")]
        public DateTime FinishDate { get; set; }

        [JsonPropertyName("timeFrame")]
        public string TimeFrame { get; set; }
    }
}
