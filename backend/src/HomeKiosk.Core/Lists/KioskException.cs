namespace HomeKiosk.Core.Lists;

public enum KioskErrorKind
{
    NotFound,
    Conflict,
    Invalid,
    TooLarge,
    Unavailable,
}

/// <summary>An expected failure of a list operation. The API maps it to a ProblemDetails response.</summary>
public sealed class KioskException(KioskErrorKind kind, string message, string? field = null) : Exception(message)
{
    public KioskErrorKind Kind { get; } = kind;

    /// <summary>The request field at fault, for <see cref="KioskErrorKind.Invalid"/>.</summary>
    public string? Field { get; } = field;

    public static KioskException ListNotFound(string slug) => new(KioskErrorKind.NotFound, $"No list called '{slug}'.");

    public static KioskException ItemNotFound(Guid id) => new(KioskErrorKind.NotFound, $"No item with id '{id}'.");

    public static KioskException Invalid(string field, string message) => new(KioskErrorKind.Invalid, message, field);

    public static KioskException Conflict(string message) => new(KioskErrorKind.Conflict, message);

    public static KioskException TooLarge(string message) => new(KioskErrorKind.TooLarge, message);

    public static KioskException Unavailable(string message) => new(KioskErrorKind.Unavailable, message);
}
