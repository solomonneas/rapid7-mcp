import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register alert management tools.
 *
 * Provides listing, retrieval, status updates, and evidence
 * extraction for InsightIDR alerts.
 */
export function registerAlertTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // list_alerts
  // -------------------------------------------------------------------------
  server.tool(
    "list_alerts",
    "List InsightIDR alerts with optional filters for severity, type, status, and date range",
    {
      severity: z
        .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .optional()
        .describe("Filter by alert severity"),
      type: z
        .enum(["ENDPOINT", "UBA", "NETWORK", "LOG", "CLOUD", "CUSTOM", "HONEYPOT", "DECEPTION"])
        .optional()
        .describe("Filter by alert type/source"),
      status: z
        .enum(["OPEN", "INVESTIGATING", "CLOSED"])
        .optional()
        .describe("Filter by alert status"),
      start_time: z
        .string()
        .optional()
        .describe("Filter alerts created after this ISO 8601 timestamp"),
      end_time: z
        .string()
        .optional()
        .describe("Filter alerts created before this ISO 8601 timestamp"),
      investigation_id: z
        .string()
        .optional()
        .describe("Filter alerts linked to a specific investigation"),
      sort: z
        .string()
        .optional()
        .describe("Sort field (e.g., '-created_time' for newest first)"),
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
    async ({
      severity,
      type,
      status,
      start_time,
      end_time,
      investigation_id,
      sort,
      size,
      index,
    }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (severity) params.severity = severity;
        if (type) params.type = type;
        if (status) params.statuses = status;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;
        if (investigation_id) params.investigation_rrn = investigation_id;
        if (sort) params.sort = sort;

        const response = await client.getAlerts(params);

        const result = {
          alerts: response.data.map((alert) => ({
            id: alert.id,
            rrn: alert.rrn,
            title: alert.title,
            severity: alert.severity,
            type: alert.type,
            status: alert.status,
            created_time: alert.created_time,
            updated_time: alert.updated_time,
            investigation_rrn: alert.investigation_rrn,
            rule_name: alert.rule?.name,
            mitre_tcodes: alert.rule?.mitre_tcodes,
            source: alert.source,
            first_event_time: alert.first_event_time,
            latest_event_time: alert.latest_event_time,
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
  // get_alert
  // -------------------------------------------------------------------------
  server.tool(
    "get_alert",
    "Get full details of a specific InsightIDR alert including its detection rule and metadata",
    {
      alert_id: z
        .string()
        .describe("Alert ID or RRN"),
    },
    async ({ alert_id }) => {
      try {
        const response = await client.getAlert(alert_id);
        const alert = response.data;

        const result = {
          id: alert.id,
          rrn: alert.rrn,
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
          type: alert.type,
          status: alert.status,
          created_time: alert.created_time,
          updated_time: alert.updated_time,
          detection_rule_rrn: alert.detection_rule_rrn,
          investigation_rrn: alert.investigation_rrn,
          assignee: alert.assignee,
          source: alert.source,
          rule: alert.rule,
          organization_id: alert.organization_id,
          first_event_time: alert.first_event_time,
          latest_event_time: alert.latest_event_time,
          external_source: alert.external_source,
          external_id: alert.external_id,
          version: alert.version,
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
  // update_alert_status
  // -------------------------------------------------------------------------
  server.tool(
    "update_alert_status",
    "Update the status of an InsightIDR alert (open, investigating, or closed)",
    {
      alert_id: z
        .string()
        .describe("Alert ID or RRN"),
      status: z
        .enum(["OPEN", "INVESTIGATING", "CLOSED"])
        .describe("New alert status"),
      assignee_email: z
        .string()
        .email()
        .optional()
        .describe("Email of the user to assign to"),
    },
    async ({ alert_id, status, assignee_email }) => {
      try {
        const body: Record<string, unknown> = { status };
        if (assignee_email) body.assignee = { email: assignee_email };

        const response = await client.updateAlertStatus(alert_id, body);
        const alert = response.data;

        const result = {
          id: alert.id,
          rrn: alert.rrn,
          title: alert.title,
          status: alert.status,
          severity: alert.severity,
          assignee: alert.assignee,
          updated_time: alert.updated_time,
          message: `Alert status updated to ${status}`,
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
  // get_alert_evidence
  // -------------------------------------------------------------------------
  server.tool(
    "get_alert_evidence",
    "Get evidence and indicators associated with an InsightIDR alert",
    {
      alert_id: z
        .string()
        .describe("Alert ID or RRN"),
    },
    async ({ alert_id }) => {
      try {
        const response = await client.getAlertEvidence(alert_id);
        const evidence = response.data;

        const result = {
          alert_id,
          indicators: evidence.indicators.map((ind) => ({
            type: ind.type,
            value: ind.value,
            source: ind.source,
            first_seen: ind.first_seen,
            last_seen: ind.last_seen,
          })),
          indicator_count: evidence.indicators.length,
          events: evidence.events.map((evt) => ({
            id: evt.id,
            timestamp: evt.timestamp,
            type: evt.type,
            data: evt.data,
          })),
          event_count: evidence.events.length,
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
