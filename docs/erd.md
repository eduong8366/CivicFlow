# Data model

CivicFlow stores everything in one SQL Server database. The schema is created by EF Core migrations in `backend/src/CivicFlow.Infrastructure/Persistence/Migrations`.

```mermaid
erDiagram
    Department ||--o{ User : "employs"
    Department ||--o{ WorkflowStepTemplate : "handles"
    Department ||--o{ WorkflowTask : "queues"

    CaseType ||--|{ CaseTypeField : "defines"
    CaseType ||--|{ WorkflowStepTemplate : "defines"
    CaseType ||--o{ Case : "classifies"

    Case ||--o{ CaseFieldValue : "has"
    CaseTypeField ||--o{ CaseFieldValue : "answered by"
    Case ||--|{ WorkflowTask : "moves through"
    WorkflowStepTemplate ||--o{ WorkflowTask : "instantiated as"
    Case ||--o{ Comment : "has"
    Case ||--o{ Attachment : "has"

    User ||--o{ Case : "created"
    User |o--o{ WorkflowTask : "assigned"
    User ||--o{ Comment : "wrote"
    User ||--o{ Attachment : "uploaded"

    Department {
        int Id PK
        string Name UK
        string Code UK
        bool IsActive
    }
    User {
        int Id PK
        string Email UK
        string FullName
        string PasswordHash
        string Role "Admin | Supervisor | Staff"
        int DepartmentId FK "null for agency-wide admins"
        bool IsActive
    }
    CaseType {
        int Id PK
        string Name UK
        string Prefix UK "BLD, CE, PRR, IT"
        string Description
        bool IsActive
    }
    CaseTypeField {
        int Id PK
        int CaseTypeId FK
        string Label
        string Key "camelCase, unique per type"
        string DataType "Text | Number | Date | Select | Checkbox"
        bool IsRequired
        string Options "JSON list, Select only"
        int SortOrder
    }
    WorkflowStepTemplate {
        int Id PK
        int CaseTypeId FK
        string Name
        int SortOrder
        int DepartmentId FK
        int SlaDays
        string AllowedOutcomes "flags, e.g. Approve, Reject, Return"
    }
    Case {
        int Id PK
        string CaseNumber UK "BLD-2026-000042"
        int CaseTypeId FK
        string Title
        string Description
        string Priority "Low | Normal | High | Urgent"
        string Status "Open | InProgress | OnHold | Closed | Cancelled"
        string Resolution "Completed | Rejected, when Closed"
        string RequesterName
        string RequesterEmail
        string RequesterPhone
        string RequesterAddress
        int CreatedById FK
        datetimeoffset CreatedAt
        date DueDate
        datetimeoffset ClosedAt
        rowversion RowVersion
    }
    CaseFieldValue {
        int Id PK
        int CaseId FK
        int FieldId FK
        string Value "normalized text"
    }
    WorkflowTask {
        int Id PK
        int CaseId FK
        int StepTemplateId FK
        string Name "snapshot of the step"
        int Sequence
        int DepartmentId FK
        int AssigneeId FK "null while in the queue"
        string Status "Pending | Active | Completed | Skipped"
        string Outcome
        string Notes
        date DueDate "from the step's SLA"
        datetimeoffset StartedAt
        datetimeoffset CompletedAt
        rowversion RowVersion
    }
    Comment {
        int Id PK
        int CaseId FK
        int AuthorId FK
        string Body
        bool IsInternal
        datetimeoffset CreatedAt
    }
    Attachment {
        int Id PK
        int CaseId FK
        string FileName
        string ContentType
        bigint Size
        string StoragePath "random name outside the web root"
        int UploadedById FK
        datetimeoffset UploadedAt
    }
    AuditLog {
        bigint Id PK
        string EntityType
        string EntityId
        string Action "Created, Claimed, Approved, PutOnHold..."
        int CaseId "set for anything belonging to a case"
        int UserId "null for system changes"
        datetimeoffset Timestamp
        string Changes "JSON: property -> old/new"
    }
```

## Notes

- **Enums are stored as strings**, so the tables read clearly in SQL and in reports.
- **`AuditLog` has no foreign keys.** Audit rows must outlive anything they describe, so `CaseId` and `UserId` are plain columns. Rows are written by an EF Core `SaveChanges` interceptor in the same transaction as the change; nothing in the application writes them directly.
- **A workflow task is a step instance.** Returning a case to an earlier step, or reopening it, adds a new task for that step instead of rewinding the old one, so every decision keeps its outcome and notes. Several tasks can share a `Sequence`.
- **Tasks snapshot their step.** Name, order and department are copied when the task is created, so editing a case type doesn't rewrite the history of open cases.
- **Concurrency:** `Case` and `WorkflowTask` carry a `rowversion`. Two people acting on the same task at once get a 409 instead of overwriting each other.
- **Nothing is deleted.** Users, departments and case types are deactivated. A field or step that existing cases use can't be removed from its case type.
- **Attachments** are stored on disk under random names with only metadata in the database. The content type comes from the file extension, never from the client.
