using HomeKiosk.Core.Domain;

namespace HomeKiosk.Core.Contracts;

public enum ActionType
{
    AddItems,
    RemoveItems,
    CompleteItems,
    GetList,
    GetLists,
    ClearList,
    CreateList,
    Undo,
}

public enum ActionStatus
{
    Applied,
    NoChange,
    NotFound,
    Ambiguous,
    Failed,
}

/// <param name="List">The list's slug, or the name the user said when no such list exists.</param>
/// <param name="Items">Display text of the items involved (for getList, the open items).</param>
public sealed record ActionDto(ActionType Type, string? List, IReadOnlyList<string> Items, ActionStatus Status);

public sealed record CommandTimings(int SttMs, int ParseMs, int TotalMs);

/// <summary>Returned by /api/commands, /api/voice and /api/undo, and broadcast as <c>CommandProcessed</c>.</summary>
public sealed record CommandResponse(
    Guid CommandId,
    CommandSource Source,
    string? Transcript,
    bool Understood,
    IReadOnlyList<ActionDto> Actions,
    string Reply,
    ListDetail? List,
    string? AddedBy,
    CommandTimings Timings);

public sealed record CommandRequest(string? Text);

/// <summary>A row of <c>GET /api/commands/recent</c>, for a debug/history panel.</summary>
public sealed record CommandLogSummary(
    Guid Id,
    DateTimeOffset CreatedAt,
    CommandSource Source,
    string? RawText,
    string Parser,
    bool Understood,
    IReadOnlyList<ActionDto> Actions,
    string Reply,
    string? UserName,
    string? Error,
    bool Undone,
    CommandTimings Timings);
