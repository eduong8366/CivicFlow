# Roles and permissions

CivicFlow has three roles. Every user except an agency-wide Admin belongs to one department.

| Role | Who it's for |
|---|---|
| **Staff** | Works cases: picks up steps from their department's queue and records decisions. |
| **Supervisor** | Runs a department: assigns work, puts cases on hold, cancels and reopens them, and sees the department's dashboard and audit trail. |
| **Admin** | Runs the system: manages users, departments and case types, and can act on any case. |

## Permission matrix

| Action | Staff | Supervisor | Admin |
|---|---|---|---|
| Create a case | ✓ | ✓ | ✓ |
| View cases | involving their department, with a step assigned to them, or created by them | involving their department, or created by them | all |
| Comment on a case and attach files | cases they can view | cases they can view | all |
| See a case's history timeline | cases they can view | cases they can view | all |
| Claim a step from the queue | own department | own department | any department |
| Complete a step (record a decision) | steps assigned to them | assigned to them, or in their department | any |
| Assign, reassign or unassign a step | — | steps in their department | any |
| Put on hold, cancel, reopen a case | — ¹ | cases involving their department | any |
| Dashboard | personal | department | agency, or any department |
| Department queue | own department | own department | any department, or all |
| Agency audit log (`/audit`) | — | changes to cases they can view | everything, including admin changes |
| Manage users, departments, case types | — | — | ✓ |

¹ After a step is sent back with **Request info**, the case goes on hold. The person assigned to that step can resume it, as can a manager.

"Involving a department" means any step of the case, past or future, is routed to that department.

## How it's enforced

The API is the authority. The Angular app only hides controls the API would refuse anyway.

1. **Authentication.** Every endpoint requires a valid JWT through a fallback authorization policy, except `POST /api/auth/login` and `GET /api/health`, which opt out with `[AllowAnonymous]`. The token carries the user's id, role and department.
2. **Role policies.** Controllers use `Policies.Admin` (admin endpoints) and `Policies.SupervisorOrAdmin` (assign, hold, cancel, the agency audit log). A Staff token gets a 403 before any service code runs.
3. **Resource checks.** The services decide what a user can do with a *particular* case or task, through `WorkflowPermissions` in the Application layer:
   - `CanView` is an EF-translatable expression, so case search filters in SQL with the same rule that guards the detail page. A case that doesn't exist is a 404, and one that exists but isn't visible is a 403.
   - `CanClaim`, `CanComplete`, `CanAssign`, `CanManage` and `CanReopen` guard each workflow action. An assignee must be an active user in the step's department.
4. **UI hints.** Case detail responses include per-caller action flags such as `actions.canHold` and, on each task, `actions.canClaim`. The UI uses them to show only the buttons that will work, so the rules live in one place.
5. **Route guards.** The Angular router sends a signed-out user to sign in and a user without the right role to an "Access denied" page. The navigation is built per role.

Admins can't deactivate themselves or remove their own Admin role, so at least one active admin always remains.

## Tests

- `Workflow/WorkflowPermissionsTests` covers the rules one by one.
- The integration tests (`Integration/*EndpointTests`) call the real API as each seeded role and check the 401s, 403s and 404s: for example, Staff can't reassign, another department's case is refused, and Staff can't open the agency audit log.
