# CivicFlow

A case and workflow management system modelled on the platforms government agencies use to track permits, complaints, records requests and service tickets. Administrators define case types with custom form fields and multi-step workflows. Cases move through department queues with role-based access, SLA tracking, and a full audit trail.

> **Status:** in development.

## Features

- Configurable case types: custom fields and ordered workflow steps per type
- Workflow engine: approve, return and reject outcomes, with department queues and SLA due dates
- Role-based access (Admin, Supervisor, Staff), enforced by the API
- Comments (internal or public), file attachments, and an automatic audit log
- Dashboards: open, overdue and cycle-time metrics by role scope
- Accessibility: built to WCAG 2.1 AA / Section 508

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Angular, Angular Material, Chart.js |
| Backend | ASP.NET Core Web API (.NET 10), EF Core, FluentValidation |
| Database | SQL Server (LocalDB for development) |
| Auth | JWT bearer tokens, policy-based authorization |
| Tests | xUnit, `WebApplicationFactory`, Angular unit tests |

## Repository layout

```
backend/    ASP.NET Core solution (Domain, Application, Infrastructure, Api, Tests)
frontend/   Angular app
docs/       Architecture, ERD, permission matrix
```

## Getting started

### Prerequisites

- .NET 10 SDK
- Node.js 24 LTS and the Angular CLI
- SQL Server LocalDB
- `dotnet-ef` global tool

### Backend

```bash
cd backend
dotnet build
dotnet test
```

The API connects to `(localdb)\MSSQLLocalDB` and uses a database named `CivicFlow`; the connection string is in `src/CivicFlow.Api/appsettings.json`. To create the database and load the demo data:

```bash
dotnet ef database update -p src/CivicFlow.Infrastructure -s src/CivicFlow.Api
```

In Development, `dotnet run --project src/CivicFlow.Api` also applies any pending migrations on startup. The demo data is only seeded into an empty database. To start over, run `dotnet ef database drop -p src/CivicFlow.Infrastructure -s src/CivicFlow.Api` and then update again.

### Frontend

_Coming soon._

## Demo accounts

These accounts are seeded in Development only. All of them use the password `CivicFlow!2026`.

| Role | Email |
|---|---|
| Admin | `admin@civicflow.test` |
| Supervisor | `{dept}.supervisor@civicflow.test` |
| Staff | `{dept}.staff1@civicflow.test`, `{dept}.staff2@civicflow.test` |

The `{dept}` values are `pz` (Planning & Zoning), `ce` (Code Enforcement), `pw` (Public Works), `clk` (Clerk's Office) and `it` (IT). For example, `pz.staff1@civicflow.test` is a Planning & Zoning staff member.

The seed also creates four case types (Building Permit, Code Violation Complaint, Public Records Request and IT Service Request) and about 40 cases at varied stages: in department queues, assigned, overdue, on hold, closed and rejected.

## Screenshots

_Coming soon._
