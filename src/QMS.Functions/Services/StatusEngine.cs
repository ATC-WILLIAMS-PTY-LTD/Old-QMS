using QMS.Functions.Data;

namespace QMS.Functions.Services;

/// <summary>State of one workbook form for a job. Shared by the home "Workbook Form Status" panel and the dashboard tiles.</summary>
public sealed record FormStatus(
    string Code,              // "FM01A"
    string Name,              // "SY-QS-FM-01A"
    string Title,             // "Opportunity Initiation"
    string Requirement,       // M / O / N
    bool Enabled,
    bool Commenced,
    bool Submitted,
    bool Completed,
    bool CommencedColumn,     // whether the Commenced / Submitted / Completed column applies to this form
    bool SubmittedColumn,
    bool CompletedColumn,
    string Prerequisite,
    bool Declined = false);

/// <summary>
/// Port of the Power Apps FMStatus / DashboardNaviBtn rules (ScreenMainGallery and ScreenMenu_Standard_EOR_ITRB).
/// Forms unlock in dependency order: 01A -> 02/03A -> 04 -> 01B -> 03B -> 05/06 -> the rest.
/// </summary>
public sealed class StatusEngine
{
    public const string Standard = "Standard", Eor = "EOR", OnBoard = "ITRB - On Board", Individual = "ITRB - Individual";
    static readonly string[] V5Categories = [Standard, Eor, OnBoard, Individual];
    static readonly string[] ReviewStages =
        ["Discussion", "Agree", "Scope", "Results", "Interpretation", "Deliverable", "Partial30", "Partial50",
         "Preliminary", "Draft", "Constructability", "Final", "Check"];
    static readonly string[] AddSlots = ["1", "2", "3", "4", "5", "6"];

    // FM-05 records created before this date are exempt from FM-05 completion (DateDiff(var05.Created,"08/03/2022")>0).
    // As in Power Apps, a missing FM-05 record (blank Created) also counts as exempt. The SharePoint export has no
    // Created column for FM-05, so the job's own Created date stands in for it.
    static readonly DateTime Fm05Cutoff = new(2022, 3, 8);

    readonly JobData _j;
    readonly Dictionary<string, FormStatus> _done = [];

    public string? Category { get; }
    public bool IsV5 { get; }
    public bool IsV5Category { get; }
    public bool NoGo { get; }
    public string? ProposalSuccessful { get; }

    public StatusEngine(JobData job)
    {
        _j = job;
        IsV5 = job.Master.I("V5") == 1;
        var cat = job.Fm01A.S("ProjectCategory");
        IsV5Category = IsV5 && cat is not null && V5Categories.Contains(cat);
        Category = IsV5Category ? cat : null;
        NoGo = job.Fm02.Is("FinalDecision", "NO GO");
        ProposalSuccessful = job.Fm01B.S("ProposalSuccesfull");
    }

    bool Cat(params string[] cats) => Category is not null && cats.Contains(Category);
    bool Successful => !NoGo && (ProposalSuccessful is null || ProposalSuccessful == "Yes");
    string MoRule => Successful ? "M" : "O";
    string NoGoRule => NoGo ? "O" : "M";
    static bool Applicable(Row r) => !r.Is("NotApplicable", "Yes");

    bool C(string code) => _done[code].Completed;
    bool Fm05Exempt => !_j.Fm05.Exists || (_j.Fm05.D("Created") ?? _j.Master.D("Created")) is not { } created || created < Fm05Cutoff;
    bool ProjectGate => C("FM01B") && C("FM03B") && (C("FM05") || Fm05Exempt) && C("FM06");

    string Prereq(params string[] codes)
    {
        var pending = codes.Where(c => !C(c)).ToArray();
        var list = pending.Length > 0 ? pending : codes;
        return string.Join(", ", list.Select(c => "FM-" + c[2..])) + " Completed";
    }

    public IReadOnlyList<FormStatus> Evaluate()
    {
        var m = _j.Master;
        var approved01A = m.Is("FM01AApprovalStatus", "Approved");
        var declined = m.Is("FM01AOMApprovalStatus", "Declined");

        // ---- Proposal phase ----
        Add(new("FM01A", "SY-QS-FM-01A", "Opportunity Initiation", "M", true,
            Commenced: false, Submitted: _j.Fm01A.Exists && !approved01A, Completed: approved01A || declined,
            CommencedColumn: false, SubmittedColumn: true, CompletedColumn: true, Prerequisite: "None", Declined: declined));

        var a02 = Applicable(_j.Fm02);
        Add(new("FM02", "SY-QS-FM-02", "Go/No Go Assessment", a02 ? "M" : "N",
            a02 && C("FM01A") && approved01A,
            _j.Fm02.Exists, _j.Fm02.B("IsSubmitted"), _j.Fm02.Has("ProposalManagerSignedDate"),
            true, true, true, a02 ? Prereq("FM01A") : NotApplicableText));

        var a03A = Applicable(_j.Fm03A);
        Add(new("FM03A", "SY-QS-FM-03A", "Proposal Reviewer Allocation",
            a03A ? (IsV5Category ? "M" : NoGoRule) : "N",
            a03A && C("FM01A") && approved01A,
            _j.Fm03A.Exists, _j.Fm03A.B("IsSubmitted"),
            (_j.Fm03A.Has("LeadProManAckDateTime") || _j.Fm03A.Is("ProposalRequired", "No")) && _j.Fm03A.B("IsSubmitted"),
            true, true, true, a03A ? Prereq("FM01A") : NotApplicableText));

        var a04 = Applicable(_j.Fm04);
        Add(new("FM04", "SY-QS-FM-04", "Proposal Review",
            a04 ? (IsV5Category ? "M" : NoGoRule) : "N",
            a04 && C("FM01A") && C("FM02") && C("FM03A"),
            Commenced: _j.Fm04.Exists, Submitted: _j.Fm04.Exists,
            Completed: _j.Fm04Reviewer.Has("ReviewerSighted") || _j.Fm04RevFinalDoc
                       || (_j.Fm03A.Is("ProposalRequired", "No") && _j.Fm04.Exists),
            true, true, true, a04 ? Prereq("FM01A", "FM02", "FM03A") : NotApplicableText));

        var a01B = Applicable(_j.Fm01B);
        var sub01B = _j.Fm01B.D("SubmittedDateTime");
        Add(new("FM01B", "SY-QS-FM-01B", "Project Initiation Part B",
            a01B ? (IsV5Category ? "M" : NoGoRule) : "N",
            a01B && C("FM01A") && C("FM02") && C("FM03A") && C("FM04"),
            _j.Fm01B.Exists, _j.Fm01B.B("IsSubmitted"),
            ProposalSuccessful == "No" ||
            (_j.Fm01BTasksBudget > 0 && _j.Fm01B.Has("SignedByName")
             && (_j.Fm01B.Has("CompanyName") || sub01B < new DateTime(2022, 6, 21))
             && (m.Is("FM01BApprovalStatus", "Approved") || sub01B < new DateTime(2022, 12, 4))),
            true, true, true, a01B ? Prereq("FM04") : NotApplicableText));

        // ---- Project phase ----
        var a03B = Applicable(_j.Fm03B);
        Add(new("FM03B", "SY-QS-FM-03B", "Project Reviewer Allocation",
            !a03B ? "N" : Cat(Standard, Eor, Individual) ? "M" : Cat(OnBoard) ? "N" : MoRule,
            a03B && ProposalSuccessful != "No" && !Cat(OnBoard) && C("FM01B"),
            _j.Fm03B.Exists, _j.Fm03B.B("IsSubmitted"), _j.Fm03B.Has("LeadProManAckDateTime"),
            true, true, true, !a03B || Cat(OnBoard) ? NotApplicableText : Prereq("FM01B")));

        var a05 = Applicable(_j.Fm05);
        Add(new("FM05", "SY-QS-FM-05", "Project Review Plan",
            !a05 ? "N" : Cat(Eor) ? "O" : Cat(OnBoard) ? "N" : Cat(Individual) ? "M" : MoRule,
            a05 && (Cat(Eor, Individual) ? C("FM03B") : !Cat(OnBoard) && C("FM01A") && C("FM02") && C("FM03B") && C("FM04")),
            _j.Fm05.Exists, _j.Fm05.B("IsSubmitted"), Fm05Complete(),
            true, true, true, !a05 || Cat(OnBoard) ? NotApplicableText : Prereq("FM03B")));

        var a06 = Applicable(_j.Fm06);
        Add(new("FM06", "SY-QS-FM-06", "Project Plan",
            a06 ? (IsV5Category ? "M" : MoRule) : "N",
            a06 && (Cat(Individual) ? C("FM03B") : Cat(OnBoard) ? C("FM01B") : C("FM01A") && C("FM02") && C("FM03B") && C("FM04")),
            _j.Fm06.Exists, _j.Fm06.B("IsSubmitted"), Fm06Complete(),
            true, true, true, !a06 ? NotApplicableText : Cat(OnBoard) ? Prereq("FM01B") : Prereq("FM03B")));

        // Forms gated on FM-06 for EOR / ITRB - Individual, the full project gate otherwise.
        bool Gate07() => Cat(Eor, Individual) ? C("FM06") : !Cat(OnBoard) && ProjectGate;
        string Prereq07() => Cat(Eor, Individual) ? Prereq("FM06") : Cat(OnBoard) ? NotApplicableText : Prereq("FM05", "FM06");

        Add(new("FM07", "SY-QS-FM-07", "Safety In Design",
            Cat(Eor) ? "O" : Cat(OnBoard) ? "N" : Cat(Individual) ? "M" : MoRule,
            Gate07(), _j.Fm07 > 0, _j.Fm07Main.B("IsSubmitted"), Fm07Complete(),
            true, true, true, Prereq07()));

        Add(new("FM08", "SY-QS-FM-08", "Document Register",
            Cat(Eor, Individual) ? "M" : Cat(OnBoard) ? "N" : MoRule,
            Gate07(), _j.Fm08 > 0, false, false, true, false, false, Prereq07()));

        Add(new("FM09", "SY-QS-FM-09", "Drawings & Figures Register",
            Cat(Eor, Individual) ? "M" : Cat(OnBoard) ? "N" : NoGoRule,
            Gate07(), _j.Fm09 > 0, false, false, true, false, false, Prereq07()));

        // ---- Ongoing tasks ----
        Add(new("FM10", "SY-QS-FM-10", "Communications Matrix", "O", true,
            _j.Fm10.Exists, _j.Fm10.B("IsSubmitted"), _j.Fm10.B("IsSubmitted"), true, false, true, "None"));

        Add(new("FM11", "SY-QS-FM-11", "Change Request", "O", true,
            _j.Fm11 > 0, false, false, true, false, false, "None"));

        Add(new("FM12", "SY-QS-FM-12", "Change Register",
            Cat(Standard, Eor, Individual) ? "M" : NoGoRule,
            !Cat(Eor) || C("FM06"), _j.Fm12 > 0 || _j.Fm11Internal > 0, false, false, true, false, false,
            Cat(Eor) ? Prereq("FM06") : "None"));

        bool Gate13() => Cat(Eor, OnBoard, Individual) ? C("FM06") : ProjectGate;
        string Prereq13() => Cat(Eor, OnBoard, Individual) ? Prereq("FM06") : Prereq("FM05", "FM06");

        Add(new("FM13", "SY-QS-FM-13", "Basis Of Design", "O", Gate13(), _j.Fm13 > 0, false, false, true, false, false, Prereq13()));
        Add(new("FM14", "SY-QS-FM-14", "Work Package Plan", "O", Gate13(), _j.Fm14 > 0, false, false, true, false, false, Prereq13()));
        Add(new("FM15", "SY-QS-FM-15", "CADD Request", "O", Gate13(), _j.Fm15 > 0, false, false, true, false, false, Prereq13()));

        var a16 = _j.Fm16.Count == 0 || Applicable(_j.Fm16[0]);
        Add(new("FM16", "SY-QS-FM-16", "Project Review",
            !a16 ? "N" : Cat(Standard, Eor, Individual) ? "M" : Cat(OnBoard) ? "N" : MoRule,
            a16 && Gate07(),
            Commenced: false, Submitted: _j.Fm16.Count > 0, Completed: _j.Fm16.Count > 0 && Fm16AllSigned(),
            true, true, true, a16 ? Prereq07() : NotApplicableText));

        Add(new("FM17", "SY-QS-FM-17", "Document Transmittal", "O", Gate13(), _j.Fm17 > 0, false, false, true, false, false, Prereq13()));

        Add(new("FM18", "SY-QS-FM-18", "Client Feedback",
            IsV5Category ? "N" : "O", !IsV5Category && ProjectGate, false, false, false, true, false, false,
            IsV5Category ? NotApplicableText : Prereq("FM05", "FM06")));

        Add(new("FM19", "SY-QS-FM-19", "Project Closure", "M", true,
            false, _j.Fm19.Exists, m.I("ProjectStatus") == 1, false, true, true, "None"));

        return _done.Values.ToList();
    }

    const string NotApplicableText = "Not Applicable at this stage";

    void Add(FormStatus s) => _done[s.Code] = s;

    bool Fm05Complete()
    {
        var f = _j.Fm05;
        if (!f.B("IsSubmitted")) return false;
        foreach (var s in ReviewStages)
        {
            if (!f.Has("RevName" + s)) continue;
            if (!f.Has("PMSign" + s)) return false;
            if (f.Has("RevEmail" + s) && !f.Has("RevSign" + s)) return false;
        }
        return _j.Fm05Scope.All(r => r.Has("PMAcceptance") && (r.Has("ReviewCompleted") || !r.Has("ReviewerEmail")));
    }

    bool ProjectDirectorOk(Row form) =>
        _j.Fm01B.Is("ProjectDirectorRequired", "No") || form.Has("SignedProjectDirectorName");

    bool Fm06Complete()
    {
        var f = _j.Fm06;
        var r = _j.Fm03B;
        if (!f.B("IsSubmitted") || !f.Has("SignedProjectManagerName") || !ProjectDirectorOk(f)) return false;

        var lead = r.Has("LeadEmail");
        var allRevEmailsBlank = !lead && AddSlots.All(n => !r.Has($"Add{n}Email"));
        var siteWorkAnswered = f.Is("SiteWorkRequired", "Yes") || f.Is("SiteWorkRequired", "No");
        var reviewerSlots = new List<(string email, string signed)> { ("LeadEmail", "SignedLeadReviewerName") };
        reviewerSlots.AddRange(AddSlots.Select(n => ($"Add{n}Email", $"SignedAdditionalReviewer{n}Name")));
        var everyReviewerSigned = reviewerSlots.All(s => !r.Has(s.email) || f.Has(s.signed));

        switch (Category)
        {
            case Eor:
                return (f.Has("SignedLeadReviewerName") || !lead)
                       && (!(siteWorkAnswered && lead) || f.Has("SiteWorkRequiredSign"));
            case OnBoard:
                return f.Has("SignedOMName") && everyReviewerSigned
                       && (!(siteWorkAnswered && !allRevEmailsBlank) || f.Has("SiteWorkRequiredSign"));
            case Individual:
                return everyReviewerSigned && (f.Has("SignedLeadReviewerName") || allRevEmailsBlank)
                       && (!(siteWorkAnswered && !allRevEmailsBlank) || f.Has("SiteWorkRequiredSign"));
            default:
                string[] items = ["UseProposalScopeOfWork", "SiteWorkRequired", "CommunicationsMatrixRequired", "CompletionOfBasisOfDesignFormFM13"];
                var itemsOk = items.All(i => f.Is(i, "N/A") || f.Has(i + "Sign") || allRevEmailsBlank);
                return itemsOk && (f.Has("SignedLeadReviewerName") || !lead);
        }
    }

    bool Fm07Complete()
    {
        var f = _j.Fm07Main;
        var r = _j.Fm03B;
        return f.Has("SignedProjectManagerName")
               && (f.Has("SignedLeadReviewerName") || !r.Has("LeadEmail"))
               && AddSlots.All(n => f.Has($"SignedAdditionalReviewer{n}Name") || !r.Has($"Add{n}Email"))
               && ProjectDirectorOk(f);
    }

    bool Fm16AllSigned()
    {
        bool HasDoc(int? id, string title) => _j.Fm16Docs.Any(d => d.I("ID_FM16") == id && d.Is("Title", title));
        return _j.Fm16.All(row =>
            (row.Has("Review1SignedDateTime") || HasDoc(row.I("ID"), "Rev1")) &&
            (row.Has("ReviewerSightedFinalDeliverableDateTime") || HasDoc(row.I("ID"), "RevFinal")));
    }

    /// <summary>Compliance score "67% (6/9)" over the mandatory forms (ScreenMainGallery Label23_3).</summary>
    public (int completed, int total, int percent, string band, string color) ComplianceScore(IReadOnlyList<FormStatus> forms)
    {
        var f = forms.ToDictionary(x => x.Code);
        bool Done(string c) => f[c].Completed;
        bool SubOrDone(string c) => f[c].Submitted || f[c].Completed;
        int Count(params string[] codes) => codes.Count(Done);

        var ps = ProposalSuccessful;
        int n, c;
        if (NoGo)
        {
            n = 3; c = Count("FM01A", "FM02", "FM19");
        }
        else if (_j.Fm01A.Is("ProjectCategory", OnBoard))
        {
            var projectPhase = SubOrDone("FM01B") && SubOrDone("FM06") && ps != "No";
            n = 4 + (projectPhase ? 2 : 0) + (f["FM19"].Submitted ? 1 : 0);
            // The original formula leaves the On Board 6/7 cases blank; count the forms that make up the denominator.
            c = Count("FM01A", "FM02", "FM03A", "FM04") + (projectPhase ? Count("FM01B", "FM06") : 0)
                + (f["FM19"].Submitted && Done("FM19") ? 1 : 0);
        }
        else if (ps == "No")
        {
            n = 6; c = Count("FM01A", "FM02", "FM03A", "FM04", "FM01B", "FM06", "FM19");
        }
        else
        {
            var projectPhase = SubOrDone("FM01B");
            n = 4 + (projectPhase ? 5 : 0) + (f["FM19"].Submitted ? 1 : 0);
            c = n switch
            {
                4 => Count("FM01A", "FM02", "FM03A", "FM04"),
                5 => Count("FM01A", "FM02", "FM03A", "FM04", "FM19"),
                9 => Count("FM01A", "FM02", "FM03A", "FM04", "FM01B", "FM03B", "FM05", "FM06") + (f["FM16"].Submitted ? 1 : 0),
                _ => Count("FM01A", "FM02", "FM03A", "FM04", "FM01B", "FM03B", "FM05", "FM06", "FM19") + (f["FM16"].Submitted ? 1 : 0),
            };
        }

        c = Math.Min(c, n);
        var score = n == 0 ? 0 : (double)c / n;
        var (band, color) = score switch
        {
            <= 0.25 => ("Critical", "#8B0000"),
            <= 0.50 => ("Poor", "#FF0000"),
            <= 0.74 => ("Needs Attention", "#FFA500"),
            <= 0.84 => ("Fair", "#FFFF00"),
            <= 0.99 => ("Good", "#98D046"),
            _ => ("Excellent", "#008000"),
        };
        return (c, n, (int)Math.Round(score * 100, MidpointRounding.AwayFromZero), band, color);
    }

    /// <summary>Max of the 11 risk factors from FM-03B (if submitted) or FM-03A.</summary>
    public string RiskCategory()
    {
        string[] factors = ["PFIPopulationAtRisk", "PFIEnvironmentalHarm", "PFIClientCorporateImpact", "Schedule", "ScopeOfWork",
                            "ProjectProfile", "LegalExposure", "TechnicalComplexity", "SkillsAvailability", "PastExperience", "ProvenSolutionTechnology"];
        var (row, suffix) = _j.Fm03B.B("IsSubmitted") ? (_j.Fm03B, "Project") : (_j.Fm03A, "Proposal");
        var max = factors.Select(x => row.I(x + suffix) ?? 0).DefaultIfEmpty(0).Max();
        return max switch
        {
            1 => "1 - Routine",
            2 => "2 - Non Routine / Complex / Multi-Discipline",
            3 => "3 - Non Routine / Complex / Multi-Discipline",
            4 => "4 - Innovative / High Risk",
            _ => "",
        };
    }

    public string AssignedReviewers()
    {
        var r = _j.Fm03B.Has("LeadName") ? _j.Fm03B : _j.Fm03A;
        return string.Join(", ", new[] { r.S("LeadName"), r.S("Add1Name"), r.S("Add2Name") }.Where(x => x is not null));
    }

    /// <summary>V5 dashboard traffic light: red / yellow / green plus tooltip.</summary>
    public (string light, string tooltip) TrafficLight(IReadOnlyList<FormStatus> forms)
    {
        var fm01B = forms.First(x => x.Code == "FM01B");
        var closed = _j.Master.I("ProjectStatus") == 1;
        var declined = _j.Master.Is("FM01AOMApprovalStatus", "Declined");
        var red = (!_j.Fm01B.B("IsSubmitted") && !closed) || ProposalSuccessful == "No" || declined || !fm01B.Submitted;

        string tip =
            !_j.Fm01B.B("IsSubmitted") && !closed ? "Project is waiting for Form-01B to be submitted" :
            ProposalSuccessful == "No" ? "Proposal is not successful." :
            declined ? "Project is declined by OM. Please contact OM for further details." :
            fm01B.Submitted ? "Form 01B is submitted and waiting for the proposal phase completion" : "";

        if (red) return ("red", tip);
        return fm01B.Completed ? ("green", "Proposal phase is complete") : ("yellow", tip);
    }
}
