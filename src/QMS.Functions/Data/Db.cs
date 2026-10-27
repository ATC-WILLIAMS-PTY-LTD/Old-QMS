using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace QMS.Functions.Data;

public sealed class Db(IConfiguration config)
{
    readonly string _connectionString = config.GetConnectionString("QmsDb")
        ?? config["QmsDb"]
        ?? throw new InvalidOperationException("Connection string 'QmsDb' is not configured.");

    public SqlConnection Open()
    {
        var conn = new SqlConnection(_connectionString);
        conn.Open();
        return conn;
    }
}
