using System.Text;
using System.Text.RegularExpressions;

namespace QMS.Importer;

/// <summary>Maps SharePoint list / column names to SQL identifiers.</summary>
public static partial class Naming
{
    static readonly Dictionary<string, string> TableOverrides = new(StringComparer.OrdinalIgnoreCase)
    {
        ["QMS Master"] = "Master",
        ["Clients"] = "Clients",
        ["Client Contacts"] = "ClientContacts",
        ["QMS Site Name"] = "SiteNames",
        ["QMS SYQSFM01A Manager Changes"] = "FM01A_ManagerChanges",
    };

    static readonly Dictionary<string, string> ColumnOverrides = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Do you require Mechanical Engineering Components for the project? E.g. mechanical design and/or testing?"] = "MechanicalComponentsRequired",
        ["Will there be site work? E.g. Investigations, construction supervision, site inspections, etc?"] = "SiteWorkExpected",
        ["Please select a project category from the list below. Note that form requirements will vary depending on the category you choose"] = "ProjectCategory",
        ["Potential Contractual issues have been identified, discussed internally and alternatives / solutions have been provided for client review."] = "PotentialContractualIssuesIdentified",
        ["TentativeProjectStartSate"] = "TentativeProjectStartDate",
        ["3rdPartyPerformance"] = "ThirdPartyPerformance",
        ["Specific Rate(s)"] = "SpecificRates",
    };

    /// <summary>"QMS SY-QS-FM-01B Tasks and Budget" -> "FM01B_TasksAndBudget".</summary>
    public static string Table(string listName)
    {
        if (TableOverrides.TryGetValue(listName, out var t)) return t;
        var m = FormListRegex().Match(listName);
        if (m.Success)
        {
            var code = "FM" + m.Groups[1].Value;
            var rest = m.Groups[2].Value.Trim();
            return rest.Length == 0 ? code : code + "_" + Pascal(rest);
        }
        return Pascal(listName);
    }

    /// <summary>"SY-QS-FM-01B Approval Status" -> "FM01BApprovalStatus"; "1 Designated strategic client" -> "Q1DesignatedStrategicClient".</summary>
    public static string Column(string header)
    {
        if (ColumnOverrides.TryGetValue(header.Trim(), out var o)) return o;
        // Keep foreign-key style names readable: ID_Master, ID_Client, ID_FM08 ...
        if (header.StartsWith("ID_")) return "ID_" + Pascal(header[3..]).Replace("SYQSFM", "FM");
        var name = Pascal(header).Replace("SYQSFM", "FM");
        if (name.Length == 0) name = "Column";
        if (char.IsDigit(name[0])) name = "Q" + name;
        return name.Length > 100 ? name[..100] : name;
    }

    static string Pascal(string s)
    {
        var sb = new StringBuilder();
        foreach (var token in NonAlnumRegex().Split(s))
        {
            if (token.Length == 0) continue;
            sb.Append(char.ToUpperInvariant(token[0])).Append(token.AsSpan(1));
        }
        return sb.ToString();
    }

    [GeneratedRegex(@"^QMS SY-QS-FM-(\d+[A-Z]?)(.*)$")]
    private static partial Regex FormListRegex();

    [GeneratedRegex(@"[^A-Za-z0-9]+")]
    private static partial Regex NonAlnumRegex();
}
