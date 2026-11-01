using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;
using HomeKiosk.Core.Lists;
using Microsoft.AspNetCore.Http.HttpResults;

namespace HomeKiosk.Api.Endpoints;

public static class ListEndpoints
{
    /// <summary>Items added by a tap on the kiosk UI.</summary>
    private const string KioskUser = "Kiosk";

    public static IEndpointRouteBuilder MapListEndpoints(this IEndpointRouteBuilder app)
    {
        var lists = app.MapGroup("/api/lists").WithTags("Lists");

        lists.MapGet("/", async (ListService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetListsAsync(ct)))
            .WithSummary("All lists, default first");

        lists.MapPost("/", async (CreateListRequest request, ListService service, CancellationToken ct) =>
            {
                var summary = await service.CreateListAsync(request, ct);
                return TypedResults.Created($"/api/lists/{summary.Slug}", summary);
            })
            .WithSummary("Create a list")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status409Conflict);

        lists.MapGet("/{slug}", async (string slug, bool? includeCompleted, ListService service, CancellationToken ct) =>
                TypedResults.Ok(await service.GetListAsync(slug, includeCompleted ?? true, ct)))
            .WithSummary("A list with its items (completed items included unless includeCompleted=false)")
            .ProducesProblem(StatusCodes.Status404NotFound);

        lists.MapPatch("/{slug}", async (string slug, UpdateListRequest request, ListService service, CancellationToken ct) =>
                TypedResults.Ok(await service.UpdateListAsync(slug, request, ct)))
            .WithSummary("Rename, change aliases or make default (the slug never changes)")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        lists.MapDelete("/{slug}", async (string slug, ListService service, CancellationToken ct) =>
            {
                await service.DeleteListAsync(slug, ct);
                return TypedResults.NoContent();
            })
            .WithSummary("Soft-delete a list (not the default list)")
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        lists.MapPost("/{slug}/items", async Task<Results<Created<ItemDto>, Ok<ItemDto>>> (
                string slug,
                AddItemRequest request,
                ListService service,
                CancellationToken ct) =>
            {
                var (item, created) = await service.AddItemAsync(slug, request, KioskUser, CommandSource.Kiosk, ct);
                return created ? TypedResults.Created($"/api/items/{item.Id}", item) : TypedResults.Ok(item);
            })
            .WithSummary("Add an item (200 with the existing item if it's already on the list)")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        lists.MapPost("/{slug}/clear", async (string slug, ClearListRequest? request, ListService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ClearListAsync(slug, request?.CompletedOnly ?? true, ct)))
            .WithSummary("Remove completed items, or every item with completedOnly=false")
            .ProducesProblem(StatusCodes.Status404NotFound);

        return app;
    }
}
