using System.Text.Json.Serialization;
using CivicFlow.Api.Auth;
using CivicFlow.Api.ErrorHandling;
using CivicFlow.Api.OpenApi;
using CivicFlow.Application;
using CivicFlow.Infrastructure;
using CivicFlow.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Environment);
builder.Services.AddCivicFlowAuth();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi(o => o.AddDocumentTransformer<BearerSecuritySchemeTransformer>());
builder.Services.AddHealthChecks()
    .AddDbContextCheck<CivicFlowDbContext>();

var app = builder.Build();

app.UseExceptionHandler();
// Gives bodiless error responses (the 401s and 403s from auth, 404s for unknown routes) a ProblemDetails body.
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    app.UseSwaggerUI(o =>
    {
        o.SwaggerEndpoint("/openapi/v1.json", "CivicFlow API v1");
        o.EnablePersistAuthorization();
    });

    // Keeps a local database current (and seeded) on every `dotnet run`.
    await app.Services.MigrateDatabaseAsync();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/api/health").AllowAnonymous();

app.Run();

// Lets the integration tests' WebApplicationFactory<Program> find this entry point.
public partial class Program;
