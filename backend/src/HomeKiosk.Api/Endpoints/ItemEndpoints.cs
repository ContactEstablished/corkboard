using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Lists;

namespace HomeKiosk.Api.Endpoints;

public static class ItemEndpoints
{
    public static IEndpointRouteBuilder MapItemEndpoints(this IEndpointRouteBuilder app)
    {
        var items = app.MapGroup("/api/items").WithTags("Items");

        items.MapPatch("/{id:guid}", async (Guid id, UpdateItemRequest request, ListService service, CancellationToken ct) =>
                TypedResults.Ok(await service.UpdateItemAsync(id, request, ct)))
            .WithSummary("Edit text or quantity, or check/uncheck an item")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        items.MapDelete("/{id:guid}", async (Guid id, ListService service, CancellationToken ct) =>
            {
                await service.DeleteItemAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithSummary("Soft-delete an item")
            .ProducesProblem(StatusCodes.Status404NotFound);

        return app;
    }
}
