import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register investigation management tools.
 *
 * Provides search, get, create, update, comment, and alert retrieval
 * for InsightIDR investigations.
 */
export function registerInvestigationTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // search_investigations
  // -------------------------------------------------------------------------
  server.tool(
    "search_investigations",
    "List and filter InsightIDR investigations by status, priority, assignee, or date range",
    {
      status: z
        .enum(["OPEN", "INVESTIGATING", "WAITING", "CLOSED"])
        .optional()
        .describe("Filter by investigation status"),
      priority: z
        .enum(["UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .optional()
        .describe("Filter by priority level"),
      assignee_email: z
        .string()
        .optional()
        .describe("Filter by assignee email address"),
      start_time: z
        .string()
        .optional()
        .describe("Filter investigations created after this ISO 8601 timestamp"),
      end_time: z
        .string()
        .optional()
        .describe("Filter investigations created before this ISO 8601 timestamp"),
      sort: z
        .string()
        .optional()
        .describe("Sort field (e.g., 'created_time' or '-created_time' for descending)"),
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
    async ({ status, priority, assignee_email, start_time, end_time, sort, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (status) params.statuses = status;
        if (priority) params.priorities = priority;
        if (assignee_email) params.assignee_email = assignee_email;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;
        if (sort) params.sort = sort;

        const response = await client.getInvestigations(params);

        const result = {
          investigations: response.data.map((inv) => ({
            id: inv.id,
            rrn: inv.rrn,
            title: inv.title,
            status: inv.status,
            priority: inv.priority,
            disposition: inv.disposition,
            assignee: inv.assignee?.name,
            assignee_email: inv.assignee?.email,
            created_time: inv.created_time,
            last_accessed: inv.last_accessed,
            source: inv.source,
            threat_type: inv.threat_type,
            tags: inv.tags,
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
  // get_investigation
  // -------------------------------------------------------------------------
  server.tool(
    "get_investigation",
    "Get full details of a specific InsightIDR investigation including its timeline",
    {
      investigation_id: z
        .string()
        .describe("Investigation ID or RRN"),
    },
    async ({ investigation_id }) => {
      try {
        const [invResponse, timelineResponse] = await Promise.all([
          client.getInvestigation(investigation_id),
          client.getInvestigationTimeline(investigation_id).catch(() => ({
            data: [],
          })),
        ]);

        const inv = invResponse.data;
        const result = {
          id: inv.id,
          rrn: inv.rrn,
          title: inv.title,
          status: inv.status,
          priority: inv.priority,
          disposition: inv.disposition,
          assignee: inv.assignee,
          created_time: inv.created_time,
          last_accessed: inv.last_accessed,
          source: inv.source,
          organization_id: inv.organization_id,
          threat_type: inv.threat_type,
          responsibility: inv.responsibility,
          tags: inv.tags,
          alerts_most_recent_evidence: inv.alerts_most_recent_evidence,
          alerts_most_recent_created_time: inv.alerts_most_recent_created_time,
          timeline: timelineResponse.data,
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
  // create_investigation
  // -------------------------------------------------------------------------
  server.tool(
    "create_investigation",
    "Create a new InsightIDR investigation with a title, priority, and status",
    {
      title: z
        .string()
        .min(1)
        .max(256)
        .describe("Investigation title"),
      priority: z
        .enum(["UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .default("MEDIUM")
        .describe("Investigation priority"),
      status: z
        .enum(["OPEN", "INVESTIGATING", "WAITING", "CLOSED"])
        .default("OPEN")
        .describe("Initial investigation status"),
      disposition: z
        .enum(["BENIGN", "MALICIOUS", "NOT_APPLICABLE", "UNDECIDED"])
        .optional()
        .describe("Investigation disposition (typically set when closing)"),
      assignee_email: z
        .string()
        .email()
        .optional()
        .describe("Email of the user to assign the investigation to"),
    },
    async ({ title, priority, status, disposition, assignee_email }) => {
      try {
        const body: Record<string, unknown> = {
          title,
          priority,
          status,
        };
        if (disposition) body.disposition = disposition;
        if (assignee_email) body.assignee = { email: assignee_email };

        const response = await client.createInvestigation(body);
        const inv = response.data;

        const result = {
          id: inv.id,
          rrn: inv.rrn,
          title: inv.title,
          status: inv.status,
          priority: inv.priority,
          disposition: inv.disposition,
          assignee: inv.assignee,
          created_time: inv.created_time,
          message: "Investigation created successfully",
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
  // update_investigation
  // -------------------------------------------------------------------------
  server.tool(
    "update_investigation",
    "Update an existing investigation's status, priority, assignee, or disposition",
    {
      investigation_id: z
        .string()
        .describe("Investigation ID or RRN"),
      status: z
        .enum(["OPEN", "INVESTIGATING", "WAITING", "CLOSED"])
        .optional()
        .describe("New investigation status"),
      priority: z
        .enum(["UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .optional()
        .describe("New investigation priority"),
      disposition: z
        .enum(["BENIGN", "MALICIOUS", "NOT_APPLICABLE", "UNDECIDED"])
        .optional()
        .describe("Investigation disposition"),
      assignee_email: z
        .string()
        .email()
        .optional()
        .describe("Email of the new assignee"),
      title: z
        .string()
        .min(1)
        .max(256)
        .optional()
        .describe("New investigation title"),
    },
    async ({ investigation_id, status, priority, disposition, assignee_email, title }) => {
      try {
        const body: Record<string, unknown> = {};
        if (status) body.status = status;
        if (priority) body.priority = priority;
        if (disposition) body.disposition = disposition;
        if (assignee_email) body.assignee = { email: assignee_email };
        if (title) body.title = title;

        if (Object.keys(body).length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "At least one field must be provided to update",
                }),
              },
            ],
            isError: true,
          };
        }

        const response = await client.updateInvestigation(investigation_id, body);
        const inv = response.data;

        const result = {
          id: inv.id,
          rrn: inv.rrn,
          title: inv.title,
          status: inv.status,
          priority: inv.priority,
          disposition: inv.disposition,
          assignee: inv.assignee,
          last_accessed: inv.last_accessed,
          message: "Investigation updated successfully",
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
  // add_investigation_comment
  // -------------------------------------------------------------------------
  server.tool(
    "add_investigation_comment",
    "Add a comment or note to an InsightIDR investigation",
    {
      investigation_id: z
        .string()
        .describe("Investigation ID or RRN"),
      body: z
        .string()
        .min(1)
        .describe("Comment text to add"),
      visibility: z
        .enum(["PUBLIC", "PRIVATE"])
        .default("PUBLIC")
        .describe("Comment visibility"),
    },
    async ({ investigation_id, body: commentBody, visibility }) => {
      try {
        const response = await client.addInvestigationComment(
          investigation_id,
          { body: commentBody, visibility }
        );
        const comment = response.data;

        const result = {
          id: comment.id,
          body: comment.body,
          created_time: comment.created_time,
          creator: comment.creator,
          visibility: comment.visibility,
          message: "Comment added successfully",
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
  // get_investigation_alerts
  // -------------------------------------------------------------------------
  server.tool(
    "get_investigation_alerts",
    "Get all alerts associated with a specific investigation",
    {
      investigation_id: z
        .string()
        .describe("Investigation ID or RRN"),
      size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of alerts to return (1-100)"),
      index: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Pagination index"),
    },
    async ({ investigation_id, size, index }) => {
      try {
        const response = await client.getInvestigationAlerts(
          investigation_id,
          { size, index }
        );

        const result = {
          investigation_id,
          alerts: response.data.map((alert) => ({
            id: alert.id,
            rrn: alert.rrn,
            title: alert.title,
            severity: alert.severity,
            type: alert.type,
            status: alert.status,
            created_time: alert.created_time,
            rule: alert.rule,
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
}
