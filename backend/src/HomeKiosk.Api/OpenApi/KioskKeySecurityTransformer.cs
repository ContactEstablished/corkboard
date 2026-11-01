using HomeKiosk.Api.Auth;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace HomeKiosk.Api.OpenApi;

/// <summary>Declares the <c>X-Kiosk-Key</c> header so Scalar can send it.</summary>
internal sealed class KioskKeySecurityTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken ct)
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes[KioskKeyAuthHandler.SchemeName] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.ApiKey,
            In = ParameterLocation.Header,
            Name = KioskKeyAuthHandler.HeaderName,
            Description = "The kiosk's shared key (Kiosk:ApiKey).",
        };

        document.Security ??= [];
        document.Security.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference(KioskKeyAuthHandler.SchemeName, document)] = [],
        });

        return Task.CompletedTask;
    }
}
