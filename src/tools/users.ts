import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register user account and behavior analytics tools.
 *
 * Provides user search, activity tracking, and UBA risk
 * scoring for InsightIDR-monitored accounts.
 */
export function registerUserTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // search_users
  // -------------------------------------------------------------------------
  server.tool(
    "search_users",
    "Search user accounts monitored by InsightIDR by name, email, domain, or department",
    {
      name: z
        .string()
        .optional()
        .describe("Filter by user display name (partial match)"),
      email: z
        .string()
        .optional()
        .describe("Filter by email address"),
      domain: z
        .string()
        .optional()
        .describe("Filter by Active Directory domain"),
      department: z
        .string()
        .optional()
        .describe("Filter by department"),
      disabled: z
        .boolean()
        .optional()
        .describe("Filter by account disabled status"),
      search: z
        .string()
        .optional()
        .describe("General search across user fields"),
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
    async ({ name, email, domain, department, disabled, search, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (name) params.name = name;
        if (email) params.email = email;
        if (domain) params.domain = domain;
        if (department) params.department = department;
        if (disabled !== undefined) params.disabled = disabled;
        if (search) params.search = search;

        const response = await client.getUsers(params);

        const result = {
          users: response.data.map((user) => ({
            id: user.id,
            rrn: user.rrn,
            name: user.name,
            email: user.email,
            account_name: user.account_name,
            domain: user.domain,
            department: user.department,
            title: user.title,
            disabled: user.disabled,
            risk_score: user.risk_score,
            risk_level: user.risk_level,
            first_seen: user.first_seen,
            last_seen: user.last_seen,
            groups: user.groups,
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
  // get_user_activity
  // -------------------------------------------------------------------------
  server.tool(
    "get_user_activity",
    "Get user behavior analytics data: login times, locations, accessed assets, and anomalies",
    {
      user_id: z
        .string()
        .describe("User ID or RRN"),
      activity_type: z
        .enum(["LOGIN", "AUTHENTICATION", "ASSET_ACCESS", "SERVICE_ACCESS", "ALL"])
        .default("ALL")
        .describe("Type of activity to retrieve"),
      start_time: z
        .string()
        .optional()
        .describe("Filter activity after this ISO 8601 timestamp"),
      end_time: z
        .string()
        .optional()
        .describe("Filter activity before this ISO 8601 timestamp"),
      size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Number of activity records to return (1-100)"),
    },
    async ({ user_id, activity_type, start_time, end_time, size }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
        };
        if (activity_type !== "ALL") params.type = activity_type;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;

        const response = await client.getUserActivity(user_id, params);

        const result = {
          user_id,
          activity_type,
          activities: response.data.map((act) => ({
            timestamp: act.timestamp,
            type: act.type,
            description: act.description,
            asset_name: act.asset_name,
            asset_ip: act.asset_ip,
            source_ip: act.source_ip,
            source_location: act.source_location,
            result: act.result,
            service: act.service,
          })),
          total: response.data.length,
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
  // get_risky_users
  // -------------------------------------------------------------------------
  server.tool(
    "get_risky_users",
    "Get users with abnormal behavior scores from InsightIDR's User Behavior Analytics (UBA)",
    {
      min_risk_score: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Minimum risk score threshold (0-100)"),
      risk_level: z
        .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .optional()
        .describe("Filter by risk level"),
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
    async ({ min_risk_score, risk_level, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (min_risk_score !== undefined) params.min_risk_score = min_risk_score;
        if (risk_level) params.risk_level = risk_level;

        const response = await client.getRiskyUsers(params);

        const result = {
          risky_users: response.data.map((ru) => ({
            user_id: ru.user.id,
            name: ru.user.name,
            email: ru.user.email,
            account_name: ru.user.account_name,
            domain: ru.user.domain,
            risk_score: ru.risk_score,
            risk_level: ru.risk_level,
            risk_factors: ru.risk_factors.map((rf) => ({
              type: rf.type,
              description: rf.description,
              weight: rf.weight,
            })),
            anomaly_count: ru.anomalies.length,
            recent_anomalies: ru.anomalies.slice(0, 5).map((a) => ({
              type: a.type,
              description: a.description,
              timestamp: a.timestamp,
              severity: a.severity,
            })),
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
}
