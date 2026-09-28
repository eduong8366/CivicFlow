using System.Globalization;
using CivicFlow.Application.Abstractions;
using CivicFlow.Domain.Entities;
using CivicFlow.Domain.Enums;
using CivicFlow.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;

namespace CivicFlow.Infrastructure.Persistence.Seeding;

/// <summary>
/// Demo data for local development: five departments, sixteen users, four case types and
/// about forty cases at varied stages. It runs after migrations (EF Core's UseSeeding hook),
/// only in Development, and only into a database with no departments yet.
/// </summary>
internal static class DevDataSeeder
{
    public const string DemoPassword = "CivicFlow!2026";
    private const string EmailDomain = "civicflow.test";

    // Fixed seed, so every reset produces the same mix of cases (dates shift with "now").
    private const int RandomSeed = 20260927;

    public static async Task SeedAsync(DbContext context, bool storeManagementPerformed, CancellationToken cancellationToken)
    {
        var db = (CivicFlowDbContext)context;
        if (await db.Departments.AnyAsync(cancellationToken))
        {
            return;
        }

        var departments = CreateDepartments();
        var users = CreateUsers(departments);
        var caseTypes = CreateCaseTypes(departments);
        var cases = await CreateCasesAsync(new SqlCaseNumberGenerator(db), caseTypes, users, cancellationToken);

        db.Departments.AddRange(departments.Values);
        db.Users.AddRange(users);
        db.CaseTypes.AddRange(caseTypes);
        db.Cases.AddRange(cases);

        // A single save, so the seed is all-or-nothing.
        await db.SaveChangesAsync(cancellationToken);
    }

    private static Dictionary<string, Department> CreateDepartments() => new Department[]
    {
        new() { Name = "Planning & Zoning", Code = "PZ" },
        new() { Name = "Code Enforcement", Code = "CE" },
        new() { Name = "Public Works", Code = "PW" },
        new() { Name = "Clerk's Office", Code = "CLK" },
        new() { Name = "IT", Code = "IT" },
    }.ToDictionary(d => d.Code);

    private static readonly (string Code, string Supervisor, string Staff1, string Staff2)[] DepartmentStaff =
    [
        ("PZ", "Dana Whitfield", "Luis Ortega", "Priya Raman"),
        ("CE", "Marcus Bell", "Hannah Kowalski", "Tomas Rivera"),
        ("PW", "Grace Nakamura", "Owen Fletcher", "Jasmine Carter"),
        ("CLK", "Robert Hayes", "Elena Petrova", "Samuel Okafor"),
        ("IT", "Karen Liu", "Devin Brooks", "Aisha Mohammed"),
    ];

    /// <summary>admin@, then {dept}.supervisor@, {dept}.staff1@ and {dept}.staff2@ for each department.</summary>
    private static List<User> CreateUsers(Dictionary<string, Department> departments)
    {
        var users = new List<User>
        {
            new() { Email = $"admin@{EmailDomain}", FullName = "Morgan Ellis", Role = UserRole.Admin, Department = departments["IT"] },
        };

        foreach (var (code, supervisor, staff1, staff2) in DepartmentStaff)
        {
            var department = departments[code];
            var login = code.ToLowerInvariant();
            users.Add(new() { Email = $"{login}.supervisor@{EmailDomain}", FullName = supervisor, Role = UserRole.Supervisor, Department = department });
            users.Add(new() { Email = $"{login}.staff1@{EmailDomain}", FullName = staff1, Role = UserRole.Staff, Department = department });
            users.Add(new() { Email = $"{login}.staff2@{EmailDomain}", FullName = staff2, Role = UserRole.Staff, Department = department });
        }

        var hasher = new IdentityPasswordHasher();
        foreach (var user in users)
        {
            user.PasswordHash = hasher.Hash(user, DemoPassword);
        }

        return users;
    }

    private static List<CaseType> CreateCaseTypes(Dictionary<string, Department> dept)
    {
        const TaskOutcome intake = TaskOutcome.Complete | TaskOutcome.Reject | TaskOutcome.RequestInfo;
        const TaskOutcome review = TaskOutcome.Approve | TaskOutcome.Reject | TaskOutcome.Return | TaskOutcome.RequestInfo;
        const TaskOutcome finish = TaskOutcome.Complete | TaskOutcome.Return;

        return
        [
            NewCaseType("Building Permit Application", "BLD",
                "Permits for new construction, additions, alterations and demolition.",
                [
                    Text("Parcel Number", "parcelNumber", required: true),
                    Select("Project Type", "projectType", required: true, "New Construction", "Addition", "Alteration", "Demolition"),
                    Number("Estimated Valuation (USD)", "valuation", required: true),
                    Number("Square Footage", "squareFootage"),
                    Text("Contractor License #", "contractorLicense"),
                    Date("Planned Start Date", "startDate"),
                    Checkbox("Owner-Occupied", "ownerOccupied"),
                ],
                [
                    Step("Intake", dept["PZ"], 2, intake),
                    Step("Plan Review", dept["PZ"], 10, review),
                    Step("Inspection", dept["PW"], 5, TaskOutcome.Approve | TaskOutcome.Reject | TaskOutcome.Return),
                    Step("Issuance", dept["PZ"], 2, TaskOutcome.Complete),
                ]),
            NewCaseType("Code Violation Complaint", "CE",
                "Resident complaints about property maintenance and zoning violations.",
                [
                    Select("Violation Type", "violationType", required: true,
                        "Overgrown Vegetation", "Junk and Debris", "Unpermitted Construction", "Abandoned Vehicle", "Property Maintenance"),
                    Text("Location Details", "locationDetails", required: true),
                    Date("Observed On", "observedOn"),
                    Checkbox("Anonymous Complaint", "anonymous"),
                    Checkbox("Repeat Violation", "repeatViolation"),
                ],
                [
                    Step("Intake", dept["CE"], 2, intake),
                    Step("Investigation", dept["CE"], 10, review),
                    Step("Notice", dept["CE"], 3, finish),
                    Step("Follow-up", dept["CE"], 30, finish),
                ]),
            NewCaseType("Public Records Request", "PRR",
                "Requests for public records under the state's open records law.",
                [
                    Text("Records Requested", "recordsRequested", required: true),
                    Date("Date Range Start", "dateRangeStart"),
                    Date("Date Range End", "dateRangeEnd"),
                    Select("Delivery Method", "deliveryMethod", required: true, "Email", "Mail", "In-Person Pickup"),
                    Checkbox("Fee Waiver Requested", "feeWaiver"),
                ],
                [
                    Step("Intake", dept["CLK"], 1, intake),
                    Step("Search", dept["IT"], 5, finish | TaskOutcome.RequestInfo),
                    Step("Legal Review", dept["CLK"], 3, TaskOutcome.Approve | TaskOutcome.Reject | TaskOutcome.Return),
                    Step("Fulfillment", dept["CLK"], 2, TaskOutcome.Complete),
                ]),
            NewCaseType("IT Service Request", "IT",
                "Internal requests for hardware, software, network and account support.",
                [
                    Select("Category", "category", required: true, "Hardware", "Software", "Network", "Account Access", "Other"),
                    Text("Asset Tag", "assetTag"),
                    Number("Users Affected", "usersAffected"),
                ],
                [
                    Step("Triage", dept["IT"], 1, intake),
                    Step("Resolution", dept["IT"], 3, finish),
                ]),
        ];
    }

    private static CaseType NewCaseType(
        string name, string prefix, string description, List<CaseTypeField> fields, List<WorkflowStepTemplate> steps)
    {
        for (var i = 0; i < fields.Count; i++)
        {
            fields[i].SortOrder = i + 1;
        }

        for (var i = 0; i < steps.Count; i++)
        {
            steps[i].SortOrder = i + 1;
        }

        return new CaseType { Name = name, Prefix = prefix, Description = description, Fields = fields, Steps = steps };
    }

    private static CaseTypeField Text(string label, string key, bool required = false) =>
        new() { Label = label, Key = key, DataType = FieldDataType.Text, IsRequired = required };

    private static CaseTypeField Number(string label, string key, bool required = false) =>
        new() { Label = label, Key = key, DataType = FieldDataType.Number, IsRequired = required };

    private static CaseTypeField Date(string label, string key, bool required = false) =>
        new() { Label = label, Key = key, DataType = FieldDataType.Date, IsRequired = required };

    private static CaseTypeField Checkbox(string label, string key) =>
        new() { Label = label, Key = key, DataType = FieldDataType.Checkbox };

    private static CaseTypeField Select(string label, string key, bool required, params string[] options) =>
        new() { Label = label, Key = key, DataType = FieldDataType.Select, IsRequired = required, Options = [.. options] };

    private static WorkflowStepTemplate Step(string name, Department department, int slaDays, TaskOutcome allowedOutcomes) =>
        new() { Name = name, Department = department, SlaDays = slaDays, AllowedOutcomes = allowedOutcomes };

    // ---- Cases ------------------------------------------------------------------------------

    private static async Task<List<Case>> CreateCasesAsync(
        ICaseNumberGenerator caseNumbers, List<CaseType> caseTypes, List<User> users, CancellationToken cancellationToken)
    {
        var rng = new Random(RandomSeed);
        var now = DateTimeOffset.UtcNow;

        // 13 building permits, 11 code complaints, 9 records requests and 7 IT tickets,
        // created over the last 60 days and skewed toward recent ones.
        int[] casesPerType = [13, 11, 9, 7];
        var specs = caseTypes
            .Zip(casesPerType, (type, count) => Enumerable.Repeat(type, count))
            .SelectMany(types => types)
            .Select(type => (Type: type, CreatedAt: now - TimeSpan.FromDays(60 * Math.Pow(rng.NextDouble(), 2))))
            .OrderBy(spec => spec.CreatedAt)
            .ToList();

        var cases = new List<Case>();
        foreach (var (type, createdAt) in specs)
        {
            var @case = CreateCase(type, createdAt, now, users, rng);
            @case.CaseNumber = await caseNumbers.NextAsync(type.Prefix, createdAt.Year, cancellationToken);
            cases.Add(@case);
        }

        return cases;
    }

    private static Case CreateCase(CaseType type, DateTimeOffset createdAt, DateTimeOffset now, List<User> users, Random rng)
    {
        var steps = type.Steps.OrderBy(s => s.SortOrder).ToList();
        var fields = type.Fields.OrderBy(f => f.SortOrder).ToList();
        var values = fields.ToDictionary(f => f.Key, f => FieldValue(f, createdAt, rng));

        var @case = new Case
        {
            CaseType = type,
            Priority = PickPriority(rng),
            CreatedBy = PickWorker(users, steps[0].Department, rng),
            CreatedAt = createdAt,
            DueDate = ToDate(createdAt.AddDays(steps.Sum(s => s.SlaDays))),
            FieldValues = fields
                .Where(f => values[f.Key] is not null)
                .Select(f => new CaseFieldValue { Field = f, Value = values[f.Key] })
                .ToList(),
        };
        DescribeCase(@case, type.Prefix, values, users, rng);

        var tasks = steps
            .Select(step => new WorkflowTask
            {
                StepTemplate = step,
                Name = step.Name,
                Sequence = step.SortOrder,
                Department = step.Department,
            })
            .ToList();
        @case.Tasks = tasks;

        // Walk the workflow forward in time: each step takes a random share of its SLA
        // (sometimes more, so some tasks run overdue) until one is still in progress today.
        var cursor = createdAt;
        foreach (var task in tasks)
        {
            var step = task.StepTemplate;
            task.Status = WorkflowTaskStatus.Active;
            task.StartedAt = cursor;
            task.DueDate = ToDate(cursor.AddDays(step.SlaDays));

            var finishedAt = cursor.AddDays(step.SlaDays * (0.3 + rng.NextDouble() * 1.7));
            if (finishedAt > now)
            {
                // Roughly a third of in-progress tasks still sit unclaimed in the department queue.
                task.Assignee = rng.NextDouble() < 0.35 ? null : PickWorker(users, task.Department, rng);
                break;
            }

            var rejected = step.AllowedOutcomes.HasFlag(TaskOutcome.Reject) && rng.NextDouble() < 0.08;
            task.Assignee = PickWorker(users, task.Department, rng);
            task.Status = WorkflowTaskStatus.Completed;
            task.CompletedAt = finishedAt;
            task.Outcome = rejected ? TaskOutcome.Reject
                : step.AllowedOutcomes.HasFlag(TaskOutcome.Approve) ? TaskOutcome.Approve
                : TaskOutcome.Complete;
            task.Notes = rng.NextDouble() < 0.4 ? null : Pick(rng, rejected ? RejectNotes : CompletionNotes);
            cursor = finishedAt;

            if (rejected)
            {
                Close(@case, CaseStatus.Closed, CaseResolution.Rejected, finishedAt);
                break;
            }
        }

        var active = tasks.FirstOrDefault(t => t.Status == WorkflowTaskStatus.Active);
        if (@case.Status == CaseStatus.Closed)
        {
            // Already closed by a rejection.
        }
        else if (active is null)
        {
            Close(@case, CaseStatus.Closed, CaseResolution.Completed, tasks[^1].CompletedAt!.Value);
        }
        else
        {
            var roll = rng.NextDouble();
            if (roll < 0.07)
            {
                var cancelledAt = active.StartedAt!.Value + (now - active.StartedAt.Value) * rng.NextDouble();
                active.Status = WorkflowTaskStatus.Skipped;
                Close(@case, CaseStatus.Cancelled, resolution: null, cancelledAt);
            }
            else if (roll < 0.17)
            {
                @case.Status = CaseStatus.OnHold;
            }
            else
            {
                var untouched = active.Sequence == 1 && active.Assignee is null;
                @case.Status = untouched ? CaseStatus.Open : CaseStatus.InProgress;
            }
        }

        if (@case.Status is CaseStatus.Closed or CaseStatus.Cancelled)
        {
            foreach (var task in tasks.Where(t => t.Status == WorkflowTaskStatus.Pending))
            {
                task.Status = WorkflowTaskStatus.Skipped;
            }
        }

        AddComments(@case, now, rng);
        return @case;
    }

    private static void Close(Case @case, CaseStatus status, CaseResolution? resolution, DateTimeOffset closedAt)
    {
        @case.Status = status;
        @case.Resolution = resolution;
        @case.ClosedAt = closedAt;
    }

    private static void AddComments(Case @case, DateTimeOffset now, Random rng)
    {
        var workedTasks = @case.Tasks.Where(t => t.Assignee is not null).ToList();
        if (workedTasks.Count == 0 || rng.NextDouble() < 0.4)
        {
            return;
        }

        var lastActivity = @case.ClosedAt ?? now;
        var count = rng.Next(1, 4);
        for (var i = 0; i < count; i++)
        {
            var isInternal = rng.NextDouble() < 0.7;
            @case.Comments.Add(new Comment
            {
                Author = Pick(rng, workedTasks).Assignee!,
                Body = Pick(rng, isInternal ? InternalComments : PublicComments),
                IsInternal = isInternal,
                CreatedAt = @case.CreatedAt + (lastActivity - @case.CreatedAt) * rng.NextDouble(),
            });
        }
    }

    // ---- Case content -----------------------------------------------------------------------

    private static void DescribeCase(Case @case, string prefix, Dictionary<string, string?> values, List<User> users, Random rng)
    {
        var siteAddress = Address(rng);

        switch (prefix)
        {
            case "BLD":
                @case.Title = $"{values["projectType"]} at {siteAddress}";
                @case.Description = $"{values["projectType"]} permit for the property at {siteAddress}, parcel {values["parcelNumber"]}.";
                SetResident(@case, rng);
                break;

            case "CE":
                @case.Title = $"{values["violationType"]} at {siteAddress}";
                @case.Description = $"Complaint of {values["violationType"]!.ToLowerInvariant()} at {siteAddress}: {values["locationDetails"]}.";
                if (values["anonymous"] == "true")
                {
                    @case.RequesterName = "Anonymous";
                }
                else
                {
                    SetResident(@case, rng);
                }

                break;

            case "PRR":
                @case.Title = $"Records request: {values["recordsRequested"]}";
                @case.Description = $"Requester asks for {values["recordsRequested"]}, delivered by {values["deliveryMethod"]!.ToLowerInvariant()}.";
                SetResident(@case, rng);
                break;

            default:
                var issue = Pick(rng, ItIssues[values["category"]!]);
                var employee = Pick(rng, users.Where(u => u.Department!.Code != "IT").ToList());
                @case.Title = issue;
                @case.Description = $"{issue}. Reported by {employee.FullName} ({employee.Department!.Name}).";
                @case.RequesterName = employee.FullName;
                @case.RequesterEmail = employee.Email;
                @case.RequesterAddress = "City Hall";
                break;
        }
    }

    private static void SetResident(Case @case, Random rng)
    {
        var first = Pick(rng, FirstNames);
        var last = Pick(rng, LastNames);
        @case.RequesterName = $"{first} {last}";
        @case.RequesterEmail = $"{first}.{last}@example.com".ToLowerInvariant();
        // 555-0100 through 555-0199 are reserved for fictional use.
        @case.RequesterPhone = $"(217) 555-01{rng.Next(100):D2}";
        @case.RequesterAddress = Address(rng);
    }

    private static string? FieldValue(CaseTypeField field, DateTimeOffset createdAt, Random rng)
    {
        if (!field.IsRequired && rng.NextDouble() < 0.25)
        {
            return null;
        }

        var inv = CultureInfo.InvariantCulture;
        var created = ToDate(createdAt);

        return field.DataType switch
        {
            FieldDataType.Select => Pick(rng, field.Options),
            FieldDataType.Checkbox => rng.NextDouble() < 0.3 ? "true" : "false",
            FieldDataType.Date => (field.Key switch
            {
                "observedOn" => created.AddDays(-rng.Next(1, 15)),
                "dateRangeStart" => created.AddDays(-rng.Next(365, 731)),
                "dateRangeEnd" => created.AddDays(-rng.Next(0, 181)),
                _ => created.AddDays(rng.Next(14, 91)),
            }).ToString("yyyy-MM-dd", inv),
            FieldDataType.Number => (field.Key switch
            {
                "valuation" => rng.Next(5, 800) * 1000,
                "squareFootage" => rng.Next(120, 4500),
                _ => rng.Next(1, 25),
            }).ToString(inv),
            _ => field.Key switch
            {
                "parcelNumber" => $"{rng.Next(100, 1000)}-{rng.Next(10, 100)}-{rng.Next(1000, 10000)}",
                "contractorLicense" => $"CL-{rng.Next(100000, 1000000)}",
                "locationDetails" => Pick(rng, LocationDetails),
                "recordsRequested" => Pick(rng, RecordTopics),
                "assetTag" => $"IT-{rng.Next(10000, 100000)}",
                _ => null,
            },
        };
    }

    private static CasePriority PickPriority(Random rng) => rng.NextDouble() switch
    {
        < 0.20 => CasePriority.Low,
        < 0.75 => CasePriority.Normal,
        < 0.95 => CasePriority.High,
        _ => CasePriority.Urgent,
    };

    /// <summary>Picks someone in the department to work a task: usually staff, sometimes the supervisor.</summary>
    private static User PickWorker(List<User> users, Department department, Random rng)
    {
        var role = rng.NextDouble() < 0.85 ? UserRole.Staff : UserRole.Supervisor;
        return Pick(rng, users.Where(u => u.Department == department && u.Role == role).ToList());
    }

    private static string Address(Random rng) => $"{rng.Next(100, 10000)} {Pick(rng, Streets)}";

    private static DateOnly ToDate(DateTimeOffset value) => DateOnly.FromDateTime(value.UtcDateTime);

    private static T Pick<T>(Random rng, IReadOnlyList<T> items) => items[rng.Next(items.Count)];

    private static readonly string[] FirstNames =
        ["James", "Maria", "Robert", "Linda", "David", "Patricia", "Kevin", "Angela", "Brian", "Sofia", "Andre", "Mei", "Carlos", "Fatima", "Noah", "Rachel"];

    private static readonly string[] LastNames =
        ["Johnson", "Garcia", "Thompson", "Nguyen", "Patel", "Anderson", "Martinez", "Walker", "Kim", "Robinson", "Lopez", "Wright", "Hughes", "Sullivan"];

    private static readonly string[] Streets =
        ["Maple Ave", "Oak St", "Elm St", "Lincoln Blvd", "Washington St", "Cedar Ln", "Park Ave", "Lakeview Dr", "Main St", "Jefferson Rd", "Birch Ct", "Riverside Dr"];

    private static readonly string[] LocationDetails =
    [
        "Backyard, visible from the alley",
        "Front yard and public sidewalk",
        "Vacant lot next to the property",
        "Side yard along the fence line",
        "Driveway and street frontage",
    ];

    private static readonly string[] RecordTopics =
    [
        "council meeting minutes on the downtown rezoning",
        "police overtime reports for the last fiscal year",
        "emails between Public Works and the paving contractor",
        "building inspection reports for 400 Main St",
        "the city's current vendor contract list",
        "code enforcement complaints on Riverside Dr",
        "budget amendments adopted this year",
    ];

    private static readonly Dictionary<string, string[]> ItIssues = new()
    {
        ["Hardware"] = ["Laptop will not power on", "Replace failing monitor", "Printer on 2nd floor jams constantly"],
        ["Software"] = ["Install GIS desktop software", "Permit system crashes on save", "Office updates failing to install"],
        ["Network"] = ["Wi-Fi drops in council chambers", "VPN disconnects every hour", "Slow network at the service center"],
        ["Account Access"] = ["Locked out after password reset", "New hire needs accounts", "Access to shared finance drive"],
        ["Other"] = ["Set up conference room display", "Move workstation to new office", "Recover deleted file from share"],
    };

    private static readonly string[] CompletionNotes =
    [
        "Reviewed; everything is in order.",
        "All required documents received.",
        "Meets code requirements.",
        "Verified on site.",
        "Completed as requested.",
    ];

    private static readonly string[] RejectNotes =
    [
        "Does not meet setback requirements.",
        "Duplicate of an existing case.",
        "Outside the city's jurisdiction.",
    ];

    private static readonly string[] InternalComments =
    [
        "Called the requester to confirm the details.",
        "Waiting on a revised site plan from the applicant.",
        "Site visit scheduled for later this week.",
        "Checked GIS; the parcel boundaries match the application.",
        "Flagging for supervisor review before the next step.",
        "Spoke with the neighbor; they confirmed the issue.",
    ];

    private static readonly string[] PublicComments =
    [
        "Thank you for your submission. Your request is under review.",
        "We have received your documents and will follow up soon.",
        "Your request has moved to the next stage of review.",
    ];
}
