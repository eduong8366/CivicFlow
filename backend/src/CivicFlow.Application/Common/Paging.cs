using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Application.Common;

/// <summary>Query-string paging for list endpoints. Pages are 1-based.</summary>
public class PageQuery
{
    public const int MaxPageSize = 100;

    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (TotalCount + PageSize - 1) / PageSize;
}

/// <summary>Paging rules; validators of queries that extend <see cref="PageQuery"/> derive from this.</summary>
public abstract class PageQueryValidator<T> : AbstractValidator<T>
    where T : PageQuery
{
    protected PageQueryValidator()
    {
        RuleFor(q => q.Page).GreaterThanOrEqualTo(1);
        RuleFor(q => q.PageSize).InclusiveBetween(1, PageQuery.MaxPageSize);
    }
}

public sealed class PageQueryValidator : PageQueryValidator<PageQuery>;

public static class PagingExtensions
{
    /// <summary>Counts the query, then fetches one page of it. The query must already be ordered.</summary>
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query, PageQuery page, CancellationToken cancellationToken = default)
    {
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page.Page - 1) * page.PageSize)
            .Take(page.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }
}
