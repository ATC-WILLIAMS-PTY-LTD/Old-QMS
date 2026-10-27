using System.Globalization;

namespace QMS.Functions.Data;

/// <summary>
/// Null-safe wrapper over a dynamic Dapper row. Mirrors Power Apps semantics where a missing record
/// or blank column simply reads as blank rather than throwing.
/// </summary>
public sealed class Row
{
    public static readonly Row Empty = new(null);

    readonly IDictionary<string, object?>? _values;

    public Row(IDictionary<string, object?>? values) => _values = values;

    public static Row From(object? dapperRow) => new(dapperRow as IDictionary<string, object?>);

    public bool Exists => _values is not null;

    public object? Raw(string column) =>
        _values is not null && _values.TryGetValue(column, out var v) && v is not null and not DBNull ? v : null;

    /// <summary>Trimmed text, or null when blank.</summary>
    public string? S(string column)
    {
        var v = Raw(column);
        if (v is null) return null;
        var s = v switch
        {
            DateTime d => d.ToString("s", CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => v.ToString(),
        };
        s = s?.Trim();
        return string.IsNullOrEmpty(s) ? null : s;
    }

    public bool Has(string column) => S(column) is not null;

    public bool Is(string column, string value) => string.Equals(S(column), value, StringComparison.OrdinalIgnoreCase);

    /// <summary>True for bit 1 or "Yes"/"True" text.</summary>
    public bool B(string column) => Raw(column) switch
    {
        bool b => b,
        null => false,
        var v => v.ToString()?.Trim().ToLowerInvariant() is "yes" or "true" or "1",
    };

    public int? I(string column) => Raw(column) switch
    {
        null => null,
        int i => i,
        long l => (int)l,
        decimal d => (int)d,
        var v => int.TryParse(v.ToString(), out var n) ? n : null,
    };

    public decimal? M(string column) => Raw(column) switch
    {
        null => null,
        decimal d => d,
        var v => decimal.TryParse(v.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var n) ? n : null,
    };

    public DateTime? D(string column) => Raw(column) as DateTime?;
}
