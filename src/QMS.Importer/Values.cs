using System.Globalization;
using System.Text.RegularExpressions;

namespace QMS.Importer;

/// <summary>Parses SharePoint CSV export values (Australian dates, currency, thousands separators) and infers SQL types.</summary>
public static partial class Values
{
    static readonly string[] DateTimeFormats =
    [
        "d/M/yyyy h:mm tt", "d/M/yyyy hh:mm tt", "d/M/yyyy h:mm:ss tt",
        "d/M/yyyy H:mm", "d/M/yyyy HH:mm", "d/M/yyyy H:mm:ss",
    ];
    static readonly string[] DateFormats = ["d/M/yyyy"];

    // Columns that look numeric but must stay text (leading zeros, identifiers, phone numbers)
    [GeneratedRegex(@"post ?code|phone|mobile|fax|abn|doc ?num|order ?num|identification|contract ?no|sitecode", RegexOptions.IgnoreCase)]
    private static partial Regex ForceTextRegex();

    [GeneratedRegex(@"^-?(\d{1,3}(,\d{3})+|\d+)$")]
    private static partial Regex IntRegex();

    [GeneratedRegex(@"^-?\$?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$")]
    private static partial Regex DecimalRegex();

    public static string InferSqlType(string header, IEnumerable<string> rawValues)
    {
        var values = rawValues.Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v.Trim()).ToList();
        if (values.Count == 0) return "nvarchar(255)";

        var isId = header == "ID" || header.StartsWith("ID_") || header.EndsWith("_Id");
        var forceText = !isId && ForceTextRegex().IsMatch(header);

        if (!forceText)
        {
            if (values.All(v => bool.TryParse(v, out _))) return "bit";

            if (values.All(v => IntRegex().IsMatch(v) && !HasLeadingZero(v)))
            {
                var max = values.Max(v => Math.Abs(decimal.Parse(v.Replace(",", ""), CultureInfo.InvariantCulture)));
                return max <= int.MaxValue ? "int" : "bigint";
            }

            if (!isId && values.All(v => DecimalRegex().IsMatch(v) && v.Any(char.IsDigit) && !HasLeadingZero(v.TrimStart('-', '$'))))
                return "decimal(19,4)";

            if (!isId && values.All(v => TryDate(v, out _, out _)))
                return values.All(v => TryDate(v, out _, out var dateOnly) && dateOnly) ? "date" : "datetime2(0)";
        }

        var maxLen = values.Max(v => v.Length);
        return maxLen switch
        {
            <= 255 => "nvarchar(255)",
            <= 1000 => "nvarchar(1000)",
            <= 4000 => "nvarchar(4000)",
            _ => "nvarchar(max)",
        };
    }

    static bool HasLeadingZero(string v) => v.Length > 1 && v[0] == '0' && char.IsDigit(v[1]);

    public static bool TryDate(string v, out DateTime value, out bool dateOnly)
    {
        dateOnly = false;
        if (DateTime.TryParseExact(v, DateTimeFormats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out value)) return true;
        dateOnly = true;
        return DateTime.TryParseExact(v, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out value);
    }

    /// <summary>Converts a raw CSV string into a CLR value for the target SQL type; returns DBNull when blank or unparseable.</summary>
    public static object Convert(string? raw, string sqlType, out bool failed)
    {
        failed = false;
        if (string.IsNullOrWhiteSpace(raw)) return DBNull.Value;
        // SharePoint choice values carry a trailing zero-width space (e.g. "Queensland​"); normalise them away.
        raw = raw.Replace("​", "");
        // SharePoint choice values carry a trailing zero-width space (e.g. "Queensland​"); normalise it away.
        raw = raw?.Replace("​", "");
        if (string.IsNullOrWhiteSpace(raw)) return DBNull.Value;
        var v = raw.Trim();
        var type = sqlType.ToLowerInvariant();

        if (type.StartsWith("nvarchar") || type.StartsWith("varchar")) return raw;

        object? result = type switch
        {
            "bit" => bool.TryParse(v, out var b) ? b : v is "Yes" or "1" ? true : v is "No" or "0" ? false : null,
            "int" => int.TryParse(v.Replace(",", ""), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) ? i : null,
            "bigint" => long.TryParse(v.Replace(",", ""), NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) ? l : null,
            _ when type.StartsWith("decimal") => decimal.TryParse(v.Replace(",", "").Replace("$", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null,
            _ when type == "date" || type.StartsWith("datetime") => TryDate(v, out var dt, out _) ? dt : null,
            _ => raw,
        };

        if (result is null) { failed = true; return DBNull.Value; }
        return result;
    }
}
