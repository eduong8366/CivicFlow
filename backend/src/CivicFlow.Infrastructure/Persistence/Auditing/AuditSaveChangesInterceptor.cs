using System.Globalization;
using CivicFlow.Application.Abstractions;
using CivicFlow.Application.Audit;
using CivicFlow.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage;

namespace CivicFlow.Infrastructure.Persistence.Auditing;

/// <summary>
/// Writes an <see cref="AuditLog"/> row for every entity a save inserts, updates or deletes, with the
/// changed properties' old and new values, who made the change and the case it belongs to.
/// </summary>
/// <remarks>
/// New rows only get their database ids during the save, so the audit rows are written by a second
/// save straight after the first. Both run in one transaction, so a change is never stored without
/// its audit trail. Each DbContext gets its own instance, which is why it can keep per-save state.
/// </remarks>
internal sealed class AuditSaveChangesInterceptor(ICurrentUser? currentUser, TimeProvider timeProvider) : SaveChangesInterceptor
{
    /// <summary>Written as the value of properties whose content must not reach the log.</summary>
    public const string Redacted = "[redacted]";

    private static readonly HashSet<(Type, string)> RedactedProperties = [(typeof(User), nameof(User.PasswordHash))];

    // Server-side details the log's readers don't need.
    private static readonly HashSet<(Type, string)> IgnoredProperties = [(typeof(Attachment), nameof(Attachment.StoragePath))];

    private List<PendingEntry>? pending;
    private IDbContextTransaction? transaction;
    private bool writingAuditRows;

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        if (Collect(eventData.Context) is { } context)
        {
            transaction = context.Database.CurrentTransaction is null ? context.Database.BeginTransaction() : null;
        }

        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        if (Collect(eventData.Context) is { } context)
        {
            transaction = context.Database.CurrentTransaction is null
                ? await context.Database.BeginTransactionAsync(cancellationToken)
                : null;
        }

        return result;
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        if (TakeAuditRows(eventData.Context) is { } context)
        {
            try
            {
                context.SaveChanges();
                transaction?.Commit();
            }
            finally
            {
                EndSave();
            }
        }

        return result;
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        if (TakeAuditRows(eventData.Context) is { } context)
        {
            try
            {
                await context.SaveChangesAsync(cancellationToken);
                if (transaction is not null)
                {
                    await transaction.CommitAsync(cancellationToken);
                }
            }
            finally
            {
                EndSave();
            }
        }

        return result;
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData) => Abandon();

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        Abandon();
        return Task.CompletedTask;
    }

    public override void SaveChangesCanceled(DbContextEventData eventData) => Abandon();

    public override Task SaveChangesCanceledAsync(DbContextEventData eventData, CancellationToken cancellationToken = default)
    {
        Abandon();
        return Task.CompletedTask;
    }

    /// <summary>
    /// A failed save rolls back by disposing the transaction uncommitted. A failure while writing the
    /// audit rows is left to <see cref="SavedChanges"/>, which cleans up as the exception passes.
    /// </summary>
    private void Abandon()
    {
        if (!writingAuditRows)
        {
            EndSave();
        }
    }

    /// <summary>Records what the save is about to change. Returns the context if there's anything to audit.</summary>
    private DbContext? Collect(DbContext? context)
    {
        if (writingAuditRows || context is null or CivicFlowDbContext { AuditingSuppressed: true })
        {
            return null;
        }

        context.ChangeTracker.DetectChanges();
        pending = context.ChangeTracker.Entries()
            .Where(e => e.Entity is not AuditLog && e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .Select(PendingEntry.Capture)
            .Where(p => p is not null)
            .Select(p => p!)
            .ToList();

        return pending.Count > 0 ? context : null;
    }

    /// <summary>After a successful save, adds its audit rows to the context. Returns the context if it did.</summary>
    private DbContext? TakeAuditRows(DbContext? context)
    {
        if (writingAuditRows || context is null || pending is not { Count: > 0 } entries)
        {
            return null;
        }

        pending = null;
        var timestamp = timeProvider.GetUtcNow();
        var userId = currentUser?.UserId;
        context.Set<AuditLog>().AddRange(entries.Select(e => e.ToAuditLog(userId, timestamp)));
        writingAuditRows = true;
        return context;
    }

    private void EndSave()
    {
        pending = null;
        writingAuditRows = false;
        transaction?.Dispose();
        transaction = null;
    }

    private static IEnumerable<IProperty> AuditedProperties(EntityEntry entry) =>
        entry.Metadata.GetProperties().Where(p =>
            !p.IsPrimaryKey()
            && !p.IsConcurrencyToken
            && !IgnoredProperties.Contains((entry.Metadata.ClrType, p.Name)));

    private static string? Format(EntityEntry entry, IProperty property, object? value) =>
        value is not null && RedactedProperties.Contains((entry.Metadata.ClrType, property.Name))
            ? Redacted
            : AuditChanges.Format(value);

    /// <summary>
    /// One entity's change, captured before the save. Updates and deletes are captured in full then,
    /// while their original values are still known; inserts are read afterwards, once their ids
    /// (and foreign keys to other new rows) are real.
    /// </summary>
    private sealed class PendingEntry
    {
        private readonly EntityEntry entry;
        private readonly EntityState state;
        private readonly Dictionary<string, AuditChange>? changes;
        private readonly string? entityId;
        private readonly int? caseId;

        private PendingEntry(EntityEntry entry, EntityState state, Dictionary<string, AuditChange>? changes)
        {
            this.entry = entry;
            this.state = state;
            this.changes = changes;
            if (state != EntityState.Added)
            {
                entityId = EntityId(entry);
                caseId = CaseId(entry.Entity);
            }
        }

        public static PendingEntry? Capture(EntityEntry entry)
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    return new PendingEntry(entry, EntityState.Added, changes: null);

                case EntityState.Deleted:
                    return new PendingEntry(entry, EntityState.Deleted, AuditedProperties(entry)
                        .Select(p => (p.Name, Old: Format(entry, p, entry.OriginalValues[p])))
                        .Where(c => c.Old is not null)
                        .ToDictionary(c => c.Name, c => new AuditChange(c.Old, null)));

                default:
                    var changes = new Dictionary<string, AuditChange>();
                    foreach (var property in AuditedProperties(entry).Where(p => entry.Property(p.Name).IsModified))
                    {
                        var old = Format(entry, property, entry.OriginalValues[property]);
                        var @new = Format(entry, property, entry.CurrentValues[property]);
                        if (old != @new || RedactedProperties.Contains((entry.Metadata.ClrType, property.Name)))
                        {
                            changes[property.Name] = new AuditChange(old, @new);
                        }
                    }

                    // Nothing really changed, e.g. a property set to the value it already had.
                    return changes.Count > 0 ? new PendingEntry(entry, EntityState.Modified, changes) : null;
            }
        }

        public AuditLog ToAuditLog(int? userId, DateTimeOffset timestamp)
        {
            var values = changes ?? AuditedProperties(entry)
                .Select(p => (p.Name, New: Format(entry, p, entry.CurrentValues[p])))
                .Where(c => c.New is not null)
                .ToDictionary(c => c.Name, c => new AuditChange(null, c.New));
            var entityType = entry.Metadata.ClrType.Name;

            return new AuditLog
            {
                EntityType = entityType,
                EntityId = entityId ?? EntityId(entry),
                Action = AuditActions.Resolve(entityType, state, values, userId),
                CaseId = state == EntityState.Added ? CaseId(entry.Entity) : caseId,
                UserId = userId,
                Timestamp = timestamp,
                Changes = AuditChanges.Serialize(values),
            };
        }

        private static string EntityId(EntityEntry entry) =>
            string.Join(",", entry.Metadata.FindPrimaryKey()!.Properties
                .Select(p => Convert.ToString(entry.Property(p.Name).CurrentValue, CultureInfo.InvariantCulture)));

        private static int? CaseId(object entity) => entity switch
        {
            Case c => c.Id,
            WorkflowTask t => t.CaseId,
            Comment c => c.CaseId,
            Attachment a => a.CaseId,
            CaseFieldValue v => v.CaseId,
            _ => null,
        };
    }
}
