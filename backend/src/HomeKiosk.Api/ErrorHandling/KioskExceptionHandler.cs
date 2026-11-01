using HomeKiosk.Core.Lists;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace HomeKiosk.Api.ErrorHandling;

/// <summary>Maps expected failures to RFC 9457 ProblemDetails. Anything else falls through as a 500.</summary>
internal sealed class KioskExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        ProblemDetails? problem = exception switch
        {
            KioskException { Kind: KioskErrorKind.Invalid, Field: { } field } e => new HttpValidationProblemDetails(
                new Dictionary<string, string[]> { [field] = [e.Message] })
            {
                Status = StatusCodes.Status400BadRequest,
                Detail = e.Message,
            },
            KioskException e => new ProblemDetails
            {
                Status = e.Kind switch
                {
                    KioskErrorKind.NotFound => StatusCodes.Status404NotFound,
                    KioskErrorKind.Conflict => StatusCodes.Status409Conflict,
                    KioskErrorKind.TooLarge => StatusCodes.Status413PayloadTooLarge,
                    KioskErrorKind.Unavailable => StatusCodes.Status503ServiceUnavailable,
                    _ => StatusCodes.Status400BadRequest,
                },
                Detail = e.Message,
            },
            // Malformed JSON, missing required body, bad route values.
            BadHttpRequestException e => new ProblemDetails { Status = e.StatusCode, Detail = e.Message },
            _ => null,
        };

        if (problem is null)
        {
            return false;
        }

        context.Response.StatusCode = problem.Status!.Value;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
