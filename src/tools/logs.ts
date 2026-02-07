import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register log search and management tools.
 *
 * Provides LEQL query execution, log set listing, individual log entry
 * retrieval, and aggregate statistics.
 */
export function registerLogTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // search_logs
  // -------------------------------------------------------------------------
  server.tool(
    "search_logs",
    "Execute a LEQL (Log Entry Query Language) query against a specific log set in InsightIDR",
    {
      log_set_id: z
        .string()
        .describe(
          "ID of the log set to search. Use list_log_sets to find available log sets."
        ),
      query: z
        .string()
        .describe(
          'LEQL query statement (e.g., \'where(source_address = 10.0.0.1)\', \'where(action = BLOCK) groupby(source_address) calculate(count)\')'
        ),
      from: z
        .number()
        .optional()
        .describe("Start time as Unix timestamp in milliseconds"),
      to: z
        .number()
        .optional()
        .describe("End time as Unix timestamp in milliseconds"),
      time_range: z
        .string()
        .optional()
        .describe(
          "Relative time range (e.g., 'Last 1 Hour', 'Last 24 Hours', 'Last 7 Days'). " +
            "Used when from/to are not specified."
        ),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(50)
        .describe("Number of log entries per page (1-500)"),
    },
    async ({ log_set_id, query, from, to, time_range, per_page }) => {
      try {
        const body: Record<string, unknown> = {
          leql: { statement: query },
          per_page,
        };

        if (from !== undefined && to !== undefined) {
          body.during = { from, to };
        } else if (time_range) {
          body.during = { time_range };
        } else {
          // Default to last 24 hours
          body.during = { time_range: "Last 24 Hours" };
        }

        const response = await client.searchLogs(log_set_id, body);

        const result = {
          query,
          log_set_id,
          events: response.events.map((event) => ({
            log_id: event.log_id,
            timestamp: new Date(event.timestamp).toISOString(),
            message: event.message,
            labels: event.labels,
          })),
          event_count: response.events.length,
          statistics: response.statistics
            ? {
                from: response.statistics.from
                  ? new Date(response.statistics.from).toISOString()
                  : undefined,
                to: response.statistics.to
                  ? new Date(response.statistics.to).toISOString()
                  : undefined,
                count: response.statistics.count,
                groups: response.statistics.groups,
                stats: response.statistics.stats,
              }
            : undefined,
          time_range: response.leql?.during?.time_range || `${from} - ${to}`,
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
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
  // list_log_sets
  // -------------------------------------------------------------------------
  server.tool(
    "list_log_sets",
    "List all available log sets in InsightIDR (Firewall, DNS, DHCP, Endpoint, Cloud, etc.)",
    {},
    async () => {
      try {
        const response = await client.getLogSets();

        const result = {
          log_sets: response.logsets.map((ls) => ({
            id: ls.id,
            name: ls.name,
            description: ls.description,
            log_type: ls.log_type,
            source_type: ls.source_type,
            retention_period: ls.retention_period,
          })),
          total: response.logsets.length,
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
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
  // get_log_entry
  // -------------------------------------------------------------------------
  server.tool(
    "get_log_entry",
    "Retrieve a specific log entry by its ID from a given log set",
    {
      log_set_id: z
        .string()
        .describe("ID of the log set containing the entry"),
      log_id: z
        .string()
        .describe("ID of the specific log entry"),
    },
    async ({ log_set_id, log_id }) => {
      try {
        const response = await client.getLogEntry(log_set_id, log_id);
        const entry = response.data;

        const result = {
          log_id: entry.log_id,
          log_set_id,
          timestamp: new Date(entry.timestamp).toISOString(),
          message: entry.message,
          labels: entry.labels,
          sequence_number: entry.sequence_number,
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
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
  // get_log_stats
  // -------------------------------------------------------------------------
  server.tool(
    "get_log_stats",
    "Get aggregate statistics for a log set over a time range using a LEQL query",
    {
      log_set_id: z
        .string()
        .describe("ID of the log set"),
      query: z
        .string()
        .default("calculate(count)")
        .describe("LEQL query for aggregation (e.g., 'groupby(source_address) calculate(count)')"),
      from: z
        .number()
        .optional()
        .describe("Start time as Unix timestamp in milliseconds"),
      to: z
        .number()
        .optional()
        .describe("End time as Unix timestamp in milliseconds"),
      time_range: z
        .string()
        .optional()
        .describe("Relative time range (e.g., 'Last 24 Hours', 'Last 7 Days')"),
    },
    async ({ log_set_id, query, from, to, time_range }) => {
      try {
        const body: Record<string, unknown> = {
          leql: { statement: query },
        };

        if (from !== undefined && to !== undefined) {
          body.during = { from, to };
        } else if (time_range) {
          body.during = { time_range };
        } else {
          body.during = { time_range: "Last 24 Hours" };
        }

        const response = await client.getLogStats(log_set_id, body);

        const result = {
          log_set_id,
          query,
          statistics: {
            from: response.statistics.from
              ? new Date(response.statistics.from).toISOString()
              : undefined,
            to: response.statistics.to
              ? new Date(response.statistics.to).toISOString()
              : undefined,
            count: response.statistics.count,
            granularity: response.statistics.granularity,
            timeseries: response.statistics.timeseries,
            groups: response.statistics.groups,
            stats: response.statistics.stats,
          },
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
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
