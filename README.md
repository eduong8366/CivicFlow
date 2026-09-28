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

_Database setup and run instructions will be added here._

### Frontend

_Coming soon._

## Demo accounts

_Coming soon (seeded in Development only)._

## Screenshots

_Coming soon._
