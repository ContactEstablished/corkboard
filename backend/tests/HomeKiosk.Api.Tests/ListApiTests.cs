using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HomeKiosk.Core.Contracts;
using HomeKiosk.Core.Domain;

namespace HomeKiosk.Api.Tests;

public sealed class ListApiTests : IAsyncLifetime
{
    private readonly KioskApiFactory _factory = new();
    private HttpClient _client = null!;

    public ValueTask InitializeAsync()
    {
        _client = _factory.CreateKioskClient();
        return ValueTask.CompletedTask;
    }

    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Fresh_database_is_seeded_with_grocery_as_default()
    {
        var lists = await (await _client.GetAsync("/api/lists", Ct)).ReadAsync<List<ListSummary>>();

        Assert.Collection(
            lists,
            grocery =>
            {
                Assert.Equal("grocery", grocery.Slug);
                Assert.True(grocery.IsDefault);
            },
            todo =>
            {
                Assert.Equal("to-do", todo.Slug);
                Assert.Equal("To-do", todo.Name);
                Assert.False(todo.IsDefault);
            });
    }

    [Fact]
    public async Task Adding_an_item_returns_201_and_a_duplicate_returns_the_existing_item()
    {
        var created = await _client.PostAsJsonAsync("/api/lists/grocery/items", new { text = "milk", quantity = "2 gallons" }, Ct);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var item = await created.ReadAsync<ItemDto>();
        Assert.Equal("Milk", item.Text);
        Assert.Equal("2 gallons", item.Quantity);
        Assert.Equal("Kiosk", item.AddedBy);
        Assert.Equal(CommandSource.Kiosk, item.Source);

        var duplicate = await _client.PostAsJsonAsync("/api/lists/grocery/items", new { text = "Some MILK." }, Ct);
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.Equal(item.Id, (await duplicate.ReadAsync<ItemDto>()).Id);

        var list = await (await _client.GetAsync("/api/lists/grocery", Ct)).ReadAsync<ListDetail>();
        Assert.Single(list.Items);
    }

    [Fact]
    public async Task Adding_a_completed_item_again_reopens_it()
    {
        var item = await AddAsync("eggs");
        await _client.PatchAsJsonAsync($"/api/items/{item.Id}", new { isCompleted = true }, Ct);

        var response = await _client.PostAsJsonAsync("/api/lists/grocery/items", new { text = "Eggs" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reopened = await response.ReadAsync<ItemDto>();
        Assert.Equal(item.Id, reopened.Id);
        Assert.False(reopened.IsCompleted);
        Assert.Null(reopened.CompletedAt);
    }

    [Fact]
    public async Task List_shows_open_items_oldest_first_then_completed_most_recent_first()
    {
        var bread = await AddAsync("bread");
        var milk = await AddAsync("milk");
        var eggs = await AddAsync("eggs");
        var coffee = await AddAsync("coffee");
        await _client.PatchAsJsonAsync($"/api/items/{eggs.Id}", new { isCompleted = true }, Ct);
        await _client.PatchAsJsonAsync($"/api/items/{bread.Id}", new { isCompleted = true }, Ct);

        var list = await (await _client.GetAsync("/api/lists/grocery", Ct)).ReadAsync<ListDetail>();
        Assert.Equal(["Milk", "Coffee", "Bread", "Eggs"], list.Items.Select(i => i.Text));

        var openOnly = await (await _client.GetAsync("/api/lists/grocery?includeCompleted=false", Ct)).ReadAsync<ListDetail>();
        Assert.Equal([milk.Id, coffee.Id], openOnly.Items.Select(i => i.Id));

        var summary = (await (await _client.GetAsync("/api/lists", Ct)).ReadAsync<List<ListSummary>>()).First();
        Assert.Equal((2, 2), (summary.OpenCount, summary.CompletedCount));
    }

    [Fact]
    public async Task Patching_an_item_edits_text_quantity_and_completion()
    {
        var item = await AddAsync("banana");

        var patched = await (await _client.PatchAsJsonAsync(
            $"/api/items/{item.Id}",
            new { text = "bananas", quantity = "6", isCompleted = true },
            Ct)).ReadAsync<ItemDto>();

        Assert.Equal("Bananas", patched.Text);
        Assert.Equal("6", patched.Quantity);
        Assert.True(patched.IsCompleted);
        Assert.NotNull(patched.CompletedAt);

        var cleared = await (await _client.PatchAsJsonAsync($"/api/items/{item.Id}", new { quantity = "" }, Ct)).ReadAsync<ItemDto>();
        Assert.Null(cleared.Quantity);
        Assert.True(cleared.IsCompleted); // omitted fields are unchanged
    }

    [Fact]
    public async Task Deleting_an_item_hides_it()
    {
        var item = await AddAsync("chips");

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/items/{item.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/items/{item.Id}", Ct)).StatusCode);

        var list = await (await _client.GetAsync("/api/lists/grocery", Ct)).ReadAsync<ListDetail>();
        Assert.Empty(list.Items);
    }

    [Fact]
    public async Task Clear_removes_completed_items_by_default_and_everything_on_request()
    {
        var done = await AddAsync("salt");
        await AddAsync("pepper");
        await _client.PatchAsJsonAsync($"/api/items/{done.Id}", new { isCompleted = true }, Ct);

        var afterDefault = await (await _client.PostAsync("/api/lists/grocery/clear", null, Ct)).ReadAsync<ListDetail>();
        Assert.Equal(["Pepper"], afterDefault.Items.Select(i => i.Text));

        var afterAll = await (await _client.PostAsJsonAsync("/api/lists/grocery/clear", new { completedOnly = false }, Ct))
            .ReadAsync<ListDetail>();
        Assert.Empty(afterAll.Items);
    }

    [Fact]
    public async Task Creating_a_list_derives_its_slug_and_rejects_clashing_names()
    {
        var response = await _client.PostAsJsonAsync("/api/lists", new { name = "camping trip", aliases = new[] { "Camping" } }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("/api/lists/camping-trip", response.Headers.Location?.OriginalString);
        var summary = await response.ReadAsync<ListSummary>();
        Assert.Equal(("camping-trip", "Camping trip", false), (summary.Slug, summary.Name, summary.IsDefault));

        // "Shopping" is an alias of Grocery; names, slugs and aliases share one namespace.
        var clash = await _client.PostAsJsonAsync("/api/lists", new { name = "Shopping" }, Ct);
        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Equal("application/problem+json", clash.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Invalid_input_returns_a_validation_problem()
    {
        var response = await _client.PostAsJsonAsync("/api/lists/grocery/items", new { text = "  " }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty("text", out _));
    }

    [Fact]
    public async Task Malformed_json_returns_400_problem()
    {
        var content = new StringContent("{ not json", System.Text.Encoding.UTF8, "application/json");

        var response = await _client.PostAsync("/api/lists/grocery/items", content, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Default_list_can_move_but_not_be_deleted()
    {
        var rejected = await _client.DeleteAsync("/api/lists/grocery", Ct);
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);

        var unset = await _client.PatchAsJsonAsync("/api/lists/grocery", new { isDefault = false }, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, unset.StatusCode);

        var todo = await (await _client.PatchAsJsonAsync("/api/lists/TO-DO", new { name = "Chores list", isDefault = true }, Ct))
            .ReadAsync<ListSummary>();
        Assert.Equal(("to-do", "Chores list", true), (todo.Slug, todo.Name, todo.IsDefault));

        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync("/api/lists/grocery", Ct)).StatusCode);
        var lists = await (await _client.GetAsync("/api/lists", Ct)).ReadAsync<List<ListSummary>>();
        Assert.Equal(["to-do"], lists.Select(l => l.Slug));
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/api/lists/grocery", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_deleted_lists_name_can_be_reused()
    {
        await _client.PostAsJsonAsync("/api/lists", new { name = "Camping" }, Ct);
        await _client.DeleteAsync("/api/lists/camping", Ct);

        var again = await _client.PostAsJsonAsync("/api/lists", new { name = "Camping" }, Ct);

        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
    }

    [Fact]
    public async Task Unknown_list_returns_404_problem()
    {
        var response = await _client.GetAsync("/api/lists/hardware", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Enums_are_camel_case_strings_on_the_wire()
    {
        await AddAsync("tea");

        var json = await _client.GetStringAsync("/api/lists/grocery", Ct);

        Assert.Contains("\"source\":\"kiosk\"", json);
    }

    private async Task<ItemDto> AddAsync(string text)
    {
        var response = await _client.PostAsJsonAsync("/api/lists/grocery/items", new { text }, Ct);
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<ItemDto>();
    }
}
