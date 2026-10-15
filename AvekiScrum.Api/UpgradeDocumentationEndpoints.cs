using System.Text;
using AvekiScrum.Application.Configuration;
using AvekiScrum.Application.Upgrade;
using Microsoft.Extensions.Options;

namespace AvekiScrum.Api;

/// <summary>
/// AvekiDokumentation → Uppgradering. Thin HTTP layer over UpgradeDocumentationService - kept in its
/// own file rather than Program.cs, which is already long enough. See
/// docs/Uppgraderingsdokumentation/UPPGRADERINGSDOKUMENTATION_SPEC.md §0 for the flow.
/// </summary>
internal static class UpgradeDocumentationEndpoints
{
    /// <summary>PAT mode has no signed-in user, so the client sends the name the consultant typed.</summary>
    private const string ActorHeader = "X-Aveki-Actor";

    public static void MapUpgradeDocumentation(this WebApplication app)
    {
        var group = app.MapGroup("/api/documentation/upgrade");

        group.MapGet("/structure", (UpgradeDocumentationService service, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.GetStructureAsync(ct))))
            .WithName("GetUpgradeStructure");

        group.MapGet("/checkouts", (UpgradeDocumentationService service, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.ListAsync(ct))))
            .WithName("ListUpgradeCheckouts");

        group.MapPost("/checkouts", (CreateUpgradeCheckoutRequest request, HttpContext http, UpgradeDocumentationService service,
                IOptions<TeamRoleConfig> roles, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.CreateAsync(request, Actor(http, roles), ct))))
            .WithName("CreateUpgradeCheckout");

        group.MapGet("/checkouts/{id}", (string id, UpgradeDocumentationService service, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.GetAsync(id, ct))))
            .WithName("GetUpgradeCheckout");

        group.MapPut("/checkouts/{id}/section", (string id, SaveUpgradeSectionRequest request, HttpContext http,
                UpgradeDocumentationService service, IOptions<TeamRoleConfig> roles, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.SaveSectionAsync(id, request, Actor(http, roles), ct))))
            .WithName("SaveUpgradeSection");

        group.MapPut("/checkouts/{id}/completed", (string id, SetUpgradeSectionCompletedRequest request,
                UpgradeDocumentationService service, CancellationToken ct) =>
            Run(async () => Results.Ok(new { completed = await service.SetSectionCompletedAsync(id, request, ct) })))
            .WithName("SetUpgradeSectionCompleted");

        group.MapGet("/checkouts/{id}/export", (string id, UpgradeDocumentationService service, CancellationToken ct) =>
            Run(async () =>
            {
                var (fileName, content) = await service.ExportAsync(id, ct);
                // BOM so Notepad and Word detect UTF-8 and keep åäö intact.
                var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(content)).ToArray();
                return Results.File(bytes, "text/markdown; charset=utf-8", fileName);
            }))
            .WithName("ExportUpgradeCheckout");

        group.MapPost("/checkouts/{id}/import", (string id, HttpContext http, UpgradeDocumentationService service,
                IOptions<TeamRoleConfig> roles, CancellationToken ct) =>
            Run(async () =>
            {
                using var reader = new StreamReader(http.Request.Body, Encoding.UTF8);
                var text = await reader.ReadToEndAsync(ct);
                return Results.Ok(await service.ImportAsync(id, text, Actor(http, roles), ct));
            }))
            .WithName("ImportUpgradeCheckout");

        group.MapPost("/checkouts/{id}/submit", (string id, HttpContext http, UpgradeDocumentationService service,
                IOptions<TeamRoleConfig> roles, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.SubmitAsync(id, Actor(http, roles), ct))))
            .WithName("SubmitUpgradeCheckout");

        group.MapPost("/checkouts/{id}/resolve", (string id, List<UpgradeConflictResolution> resolutions, HttpContext http,
                UpgradeDocumentationService service, IOptions<TeamRoleConfig> roles, CancellationToken ct) =>
            Run(async () => Results.Ok(await service.ResolveAsync(id, resolutions, Actor(http, roles), ct))))
            .WithName("ResolveUpgradeConflicts");

        group.MapPost("/checkouts/{id}/cancel", (string id, HttpContext http, UpgradeDocumentationService service,
                IOptions<TeamRoleConfig> roles, CancellationToken ct) =>
            Run(async () =>
            {
                await service.CancelAsync(id, Actor(http, roles), ct);
                return Results.Ok();
            }))
            .WithName("CancelUpgradeCheckout");

        group.MapGet("/attachments", (string path, UpgradeDocumentationService service, CancellationToken ct) =>
            Run(async () =>
            {
                var file = await service.GetAttachmentAsync(path, ct);
                return file is null ? Results.NotFound() : Results.File(file.Value.Bytes, file.Value.ContentType);
            }))
            .WithName("GetUpgradeAttachment");
    }

    private static UpgradeActor Actor(HttpContext http, IOptions<TeamRoleConfig> roles)
    {
        if (http.User?.Identity?.IsAuthenticated == true)
        {
            var user = SignedInUserReader.Read(http.User, roles.Value.TeamRoleMapping);
            return new UpgradeActor(user.DisplayName, user.Email ?? "");
        }
        var typed = http.Request.Headers[ActorHeader].ToString();
        var name = string.IsNullOrWhiteSpace(typed) ? "Okänd konsult" : Uri.UnescapeDataString(typed).Trim();
        return new UpgradeActor(name, "");
    }

    /// <summary>UpgradeException carries a sentence meant for the consultant - answer with it as-is.</summary>
    private static async Task<IResult> Run(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (UpgradeException ex)
        {
            return Results.Json(new { error = ex.Message }, statusCode: ex.StatusCode);
        }
    }
}
