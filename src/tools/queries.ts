import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register saved query and LEQL helper tools.
 *
 * Provides management of saved LEQL queries and a built-in
 * LEQL syntax reference for InsightIDR log searches.
 */
export function registerQueryTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // list_saved_queries
  // -------------------------------------------------------------------------
  server.tool(
    "list_saved_queries",
    "List saved LEQL queries available in InsightIDR",
    {
      search: z
        .string()
        .optional()
        .describe("Search saved queries by name or description"),
      size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of results to return (1-100)"),
      index: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Pagination index"),
    },
    async ({ search, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (search) params.search = search;

        const response = await client.getSavedQueries(params);

        const result = {
          saved_queries: response.data.map((q) => ({
            id: q.id,
            name: q.name,
            description: q.description,
            leql: q.leql.statement,
            logs: q.logs,
            created_time: q.created_time,
            updated_time: q.updated_time,
            creator: q.creator?.name,
          })),
          total: response.metadata.total_data,
          size,
          index,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // create_saved_query
  // -------------------------------------------------------------------------
  server.tool(
    "create_saved_query",
    "Save a LEQL query for reuse in InsightIDR",
    {
      name: z
        .string()
        .min(1)
        .max(256)
        .describe("Name for the saved query"),
      description: z
        .string()
        .optional()
        .describe("Description of what this query does"),
      leql_statement: z
        .string()
        .min(1)
        .describe("LEQL query statement to save"),
      log_set_ids: z
        .array(z.string())
        .min(1)
        .describe("Array of log set IDs this query applies to"),
    },
    async ({ name, description, leql_statement, log_set_ids }) => {
      try {
        const body: Record<string, unknown> = {
          name,
          leql: { statement: leql_statement },
          logs: log_set_ids,
        };
        if (description) body.description = description;

        const response = await client.createSavedQuery(body);
        const query = response.data;

        const result = {
          id: query.id,
          name: query.name,
          description: query.description,
          leql: query.leql.statement,
          logs: query.logs,
          created_time: query.created_time,
          creator: query.creator?.name,
          message: "Saved query created successfully",
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // leql_help
  // -------------------------------------------------------------------------
  server.tool(
    "leql_help",
    "Get LEQL (Log Entry Query Language) syntax reference, examples, and common patterns for InsightIDR log searches",
    {
      topic: z
        .enum(["overview", "where", "groupby", "calculate", "sort", "regex", "examples", "all"])
        .default("all")
        .describe("Specific LEQL topic to get help on"),
    },
    async ({ topic }) => {
      const sections: Record<string, string> = {
        overview: [
          "# LEQL (Log Entry Query Language) Overview",
          "",
          "LEQL is the query language used by Rapid7 InsightIDR for searching log data.",
          "Queries consist of clauses that filter, group, and calculate over log entries.",
          "",
          "Basic structure: where(<conditions>) groupby(<field>) calculate(<function>)",
          "",
          "Clauses can be chained: where → groupby → calculate → sort → limit",
        ].join("\n"),

        where: [
          "# WHERE Clause",
          "",
          "Filters log entries based on field conditions.",
          "",
          "## Operators",
          "- `=`  Equal to",
          "- `!=` Not equal to",
          "- `>`  Greater than",
          "- `>=` Greater than or equal to",
          "- `<`  Less than",
          "- `<=` Less than or equal to",
          "- `CONTAINS` Substring match",
          "- `STARTS WITH` Prefix match",
          "- `ENDS WITH` Suffix match",
          "- `IS` / `IS NOT` Null checks",
          "- `IN` / `NOT IN` Set membership",
          "",
          "## Logical Operators",
          "- `AND` Both conditions must be true",
          "- `OR`  Either condition can be true",
          "- `NOT` Negate a condition",
          "",
          "## Examples",
          "```",
          "where(source_address = 10.0.0.1)",
          "where(action = BLOCK AND destination_port = 443)",
          'where(user CONTAINS "admin")',
          "where(status >= 400 AND status < 500)",
          'where(source_address IN ["10.0.0.1", "10.0.0.2", "10.0.0.3"])',
          "where(hostname IS NOT NULL)",
          "```",
        ].join("\n"),

        groupby: [
          "# GROUPBY Clause",
          "",
          "Groups results by one or more fields for aggregation.",
          "",
          "## Syntax",
          "```",
          "groupby(field_name)",
          "groupby(field1, field2)",
          "```",
          "",
          "## Examples",
          "```",
          "where(action = BLOCK) groupby(source_address)",
          "groupby(source_address, destination_port)",
          "where(status >= 400) groupby(url)",
          "```",
        ].join("\n"),

        calculate: [
          "# CALCULATE Clause",
          "",
          "Performs aggregate calculations on results.",
          "",
          "## Functions",
          "- `count`  — Count of matching entries",
          "- `sum`    — Sum of a numeric field",
          "- `avg`    — Average of a numeric field",
          "- `min`    — Minimum value",
          "- `max`    — Maximum value",
          "- `unique` — Count distinct values",
          "- `bytes`  — Format byte sizes",
          "",
          "## Examples",
          "```",
          "calculate(count)",
          "groupby(source_address) calculate(count)",
          "where(action = ALLOW) calculate(sum:bytes_sent)",
          "groupby(user) calculate(unique:source_address)",
          "where(status >= 500) groupby(url) calculate(count)",
          "```",
        ].join("\n"),

        sort: [
          "# SORT Clause",
          "",
          "Orders results by a field.",
          "",
          "## Syntax",
          "```",
          "sort(field_name)       # ascending",
          "sort(-field_name)      # descending (prefix with -)",
          "```",
          "",
          "## Examples",
          "```",
          "groupby(source_address) calculate(count) sort(-count)",
          "where(status >= 400) sort(-timestamp)",
          "```",
        ].join("\n"),

        regex: [
          "# REGEX in LEQL",
          "",
          "LEQL supports regex matching in where clauses.",
          "",
          "## Syntax",
          "```",
          "where(field =~ /pattern/)",
          "where(field !=~ /pattern/)",
          "```",
          "",
          "## Examples",
          "```",
          "where(url =~ /\\/api\\/v[0-9]+\\/users/)",
          'where(user_agent =~ /(?i)curl|wget|python/)',
          "where(source_address =~ /^10\\.0\\.0\\./)",
          "```",
        ].join("\n"),

        examples: [
          "# Common LEQL Query Examples",
          "",
          "## Firewall / Network",
          "```",
          "where(source_address = 10.0.0.1)",
          "where(action = BLOCK) groupby(source_address) calculate(count) sort(-count)",
          "where(destination_port = 443 AND action = ALLOW)",
          "where(action = BLOCK) groupby(destination_port) calculate(count)",
          "```",
          "",
          "## Authentication",
          "```",
          'where(user = "admin" AND result = FAILED_LOGIN)',
          "where(result = FAILED_LOGIN) groupby(user) calculate(count) sort(-count)",
          "where(result = FAILED_LOGIN) groupby(source_address) calculate(count)",
          "where(result = SUCCESS AND source_address != 10.0.0.0/8)",
          "```",
          "",
          "## Web / HTTP",
          "```",
          "where(status >= 400) groupby(url) calculate(count)",
          "where(status = 500) groupby(source_address) calculate(count)",
          "where(method = POST AND url CONTAINS /api/)",
          "where(bytes_sent > 10000000) sort(-bytes_sent)",
          "```",
          "",
          "## DNS",
          "```",
          'where(query CONTAINS "malware")',
          "where(query_type = TXT) groupby(query) calculate(count)",
          "where(response_code = NXDOMAIN) groupby(query) calculate(count) sort(-count)",
          "```",
          "",
          "## Endpoint",
          "```",
          'where(process_name = "powershell.exe" AND command_line CONTAINS "-enc")',
          "where(process_name CONTAINS cmd AND parent_process = explorer.exe)",
          "groupby(process_name) calculate(count) sort(-count)",
          "```",
          "",
          "## Threat Hunting",
          "```",
          "where(destination_port NOT IN [80, 443, 8080, 8443] AND action = ALLOW)",
          "where(bytes_sent > bytes_received * 10)",
          'where(user_agent CONTAINS "curl" OR user_agent CONTAINS "wget")',
          "where(source_address = 10.0.0.0/8 AND destination_address != 10.0.0.0/8) groupby(destination_address) calculate(unique:source_address)",
          "```",
        ].join("\n"),
      };

      try {
        let output: string;
        if (topic === "all") {
          output = Object.values(sections).join("\n\n---\n\n");
        } else {
          output =
            sections[topic] || `Unknown topic: ${topic}. Available: ${Object.keys(sections).join(", ")}`;
        }

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
