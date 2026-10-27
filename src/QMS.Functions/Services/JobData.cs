using Dapper;
using QMS.Functions.Data;

namespace QMS.Functions.Services;

/// <summary>Every workbook record for one job (the web equivalent of the var01A..var19 context variables).</summary>
public sealed class JobData
{
    public required Row Master { get; init; }
    public required Row Fm01A { get; init; }
    public required Row Fm01B { get; init; }
    public int Fm01BTasksBudget { get; init; }
    public required Row Fm02 { get; init; }
    public required Row Fm03A { get; init; }
    public required Row Fm03B { get; init; }
    public required Row Fm04 { get; init; }
    public required Row Fm04Reviewer { get; init; }
    public bool Fm04RevFinalDoc { get; init; }
    public required Row Fm05 { get; init; }
    public required List<Row> Fm05Scope { get; init; }
    public required Row Fm06 { get; init; }
    public int Fm07 { get; init; }
    public required Row Fm07Main { get; init; }
    public int Fm08 { get; init; }
    public int Fm09 { get; init; }
    public required Row Fm10 { get; init; }
    public int Fm11 { get; init; }
    public int Fm11Internal { get; init; }
    public int Fm12 { get; init; }
    public int Fm13 { get; init; }
    public int Fm14 { get; init; }
    public int Fm15 { get; init; }
    public required List<Row> Fm16 { get; init; }
    public required List<Row> Fm16Docs { get; init; }
    public int Fm17 { get; init; }
    public required Row Fm19 { get; init; }
    public string? ClientName { get; init; }

    const string Sql = """
        SELECT * FROM dbo.Master WHERE ID = @id;
        SELECT TOP 1 * FROM dbo.FM01A WHERE ID_Master = @id ORDER BY ID;
        SELECT TOP 1 * FROM dbo.FM01B WHERE ID_Master = @id ORDER BY ID;
        SELECT COUNT(*) FROM dbo.FM01B_TasksAndBudget WHERE ID_Master = @id;
        SELECT TOP 1 * FROM dbo.FM02 WHERE ID_Master = @id ORDER BY ID;
        SELECT TOP 1 * FROM dbo.FM03A WHERE ID_Master = @id ORDER BY ID;
        SELECT TOP 1 * FROM dbo.FM03B WHERE ID_Master = @id ORDER BY ID;
        SELECT TOP 1 * FROM dbo.FM04 WHERE ID_Master = @id ORDER BY ID;
        SELECT TOP 1 * FROM dbo.FM04_Reviewers WHERE ID_Master = @id ORDER BY ID;
        SELECT COUNT(*) FROM dbo.FM04_ReviewersDocs WHERE ID_Master = @id AND Title = 'RevFinal';
        SELECT TOP 1 * FROM dbo.FM05 WHERE ID_Master = @id ORDER BY ID;
        SELECT * FROM dbo.FM05_ScopeOfWorkItems WHERE ID_Master = @id;
        SELECT TOP 1 * FROM dbo.FM06 WHERE ID_Master = @id ORDER BY ID;
        SELECT COUNT(*) FROM dbo.FM07 WHERE ID_Master = @id;
        SELECT TOP 1 * FROM dbo.FM07_Main WHERE ID_Master = @id ORDER BY ID;
        SELECT COUNT(*) FROM dbo.FM08 WHERE ID_Master = @id;
        SELECT COUNT(*) FROM dbo.FM09 WHERE ID_Master = @id;
        SELECT TOP 1 * FROM dbo.FM10 WHERE ID_Master = @id ORDER BY ID;
        SELECT COUNT(*) FROM dbo.FM11 WHERE ID_Master = @id;
        SELECT COUNT(*) FROM dbo.FM11 WHERE ID_Master = @id AND TypeOfChangeRequest = 'Internal project changes';
        SELECT COUNT(*) FROM dbo.FM12 WHERE ID_Master = @id;
        SELECT COUNT(*) FROM dbo.FM13 WHERE ID_Master = @id;
        SELECT COUNT(*) FROM dbo.FM14 WHERE ID_Master = @id;
        SELECT COUNT(*) FROM dbo.FM15 WHERE ID_Master = @id;
        SELECT * FROM dbo.FM16 WHERE ID_Master = @id;
        SELECT ID_FM16, Title FROM dbo.FM16_ReviewDocs WHERE ID_Master = @id;
        SELECT COUNT(*) FROM dbo.FM17 WHERE ID_Master = @id;
        SELECT TOP 1 * FROM dbo.FM19 WHERE ID_Master = @id ORDER BY ID;
        SELECT c.CompanyName FROM dbo.Master m JOIN dbo.Clients c ON c.ID = m.ID_Client WHERE m.ID = @id;
        """;

    public static async Task<JobData?> LoadAsync(Db db, int masterId)
    {
        using var conn = db.Open();
        using var q = await conn.QueryMultipleAsync(Sql, new { id = masterId });

        async Task<Row> One() => Row.From(await q.ReadFirstOrDefaultAsync());
        async Task<List<Row>> Many() => (await q.ReadAsync()).Select(Row.From).ToList();
        async Task<int> Count() => await q.ReadFirstAsync<int>();

        var master = await One();
        if (!master.Exists) return null;

        return new JobData
        {
            Master = master,
            Fm01A = await One(),
            Fm01B = await One(),
            Fm01BTasksBudget = await Count(),
            Fm02 = await One(),
            Fm03A = await One(),
            Fm03B = await One(),
            Fm04 = await One(),
            Fm04Reviewer = await One(),
            Fm04RevFinalDoc = await Count() > 0,
            Fm05 = await One(),
            Fm05Scope = await Many(),
            Fm06 = await One(),
            Fm07 = await Count(),
            Fm07Main = await One(),
            Fm08 = await Count(),
            Fm09 = await Count(),
            Fm10 = await One(),
            Fm11 = await Count(),
            Fm11Internal = await Count(),
            Fm12 = await Count(),
            Fm13 = await Count(),
            Fm14 = await Count(),
            Fm15 = await Count(),
            Fm16 = await Many(),
            Fm16Docs = await Many(),
            Fm17 = await Count(),
            Fm19 = await One(),
            ClientName = await q.ReadFirstOrDefaultAsync<string?>(),
        };
    }
}
