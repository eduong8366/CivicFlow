namespace CivicFlow.Application.Common;

// Services throw these; the API's exception handler turns them into ProblemDetails responses.
// FluentValidation's ValidationException (400) is handled there too.

/// <summary>Maps to 404 Not Found.</summary>
public sealed class NotFoundException(string entityName, object key)
    : Exception($"{entityName} '{key}' was not found.");

/// <summary>Maps to 403 Forbidden: the caller is signed in but may not do this to this resource.</summary>
public sealed class ForbiddenException(string message) : Exception(message);

/// <summary>Maps to 409 Conflict: the request clashes with the resource's current state.</summary>
public sealed class ConflictException(string message) : Exception(message);
