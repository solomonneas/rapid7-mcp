import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register threat intelligence tools.
 *
 * Provides IOC management, threat library queries, and
 * threat activity matching for InsightIDR.
 */
export function registerThreatTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // list_threat_indicators
  // -------------------------------------------------------------------------
  server.tool(
    "list_threat_indicators",
    "List IOCs (IPs, domains, hashes) in the InsightIDR threat library",
    {
      type: z
        .enum([
          "IP",
          "DOMAIN",
          "URL",
          "HASH_MD5",
          "HASH_SHA1",
          "HASH_SHA256",
          "EMAIL",
          "PROCESS",
          "FILENAME",
        ])
        .optional()
        .describe("Filter by indicator type"),
      source: z
        .string()
        .optional()
        .describe("Filter by indicator source (e.g., 'rapid7', 'custom', 'misp')"),
      threat_name: z
        .string()
        .optional()
        .describe("Filter by associated threat name or campaign"),
      search: z
        .string()
        .optional()
        .describe("Search across indicator values and descriptions"),
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
    async ({ type, source, threat_name, search, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (type) params.type = type;
        if (source) params.source = source;
        if (threat_name) params.threat_name = threat_name;
        if (search) params.search = search;

        const response = await client.getThreatIndicators(params);

        const result = {
          indicators: response.data.map((ind) => ({
            id: ind.id,
            rrn: ind.rrn,
            type: ind.type,
            value: ind.value,
            source: ind.source,
            description: ind.description,
            threat_name: ind.threat_name,
            severity: ind.severity,
            confidence: ind.confidence,
            created_time: ind.created_time,
            first_seen: ind.first_seen,
            last_seen: ind.last_seen,
            tags: ind.tags,
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
  // add_threat_indicator
  // -------------------------------------------------------------------------
  server.tool(
    "add_threat_indicator",
    "Add a new IOC (IP, domain, hash, etc.) to the InsightIDR custom threat library",
    {
      type: z
        .enum([
          "IP",
          "DOMAIN",
          "URL",
          "HASH_MD5",
          "HASH_SHA1",
          "HASH_SHA256",
          "EMAIL",
          "PROCESS",
          "FILENAME",
        ])
        .describe("Type of indicator"),
      value: z
        .string()
        .min(1)
        .describe("Indicator value (e.g., '10.0.0.1', 'malware.example.com', SHA256 hash)"),
      description: z
        .string()
        .optional()
        .describe("Description of why this indicator is malicious"),
      threat_name: z
        .string()
        .optional()
        .describe("Associated threat name or campaign"),
      severity: z
        .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .default("MEDIUM")
        .describe("Severity level of the threat"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization"),
      confidence: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("Confidence score (0-100)"),
    },
    async ({ type, value, description, threat_name, severity, tags, confidence }) => {
      try {
        const body: Record<string, unknown> = {
          type,
          value,
          source: "custom",
          severity,
        };
        if (description) body.description = description;
        if (threat_name) body.threat_name = threat_name;
        if (tags) body.tags = tags;
        if (confidence !== undefined) body.confidence = confidence;

        const response = await client.addThreatIndicator(body);
        const ind = response.data;

        const result = {
          id: ind.id,
          rrn: ind.rrn,
          type: ind.type,
          value: ind.value,
          source: ind.source,
          description: ind.description,
          threat_name: ind.threat_name,
          severity: ind.severity,
          confidence: ind.confidence,
          created_time: ind.created_time,
          tags: ind.tags,
          message: "Threat indicator added successfully",
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
  // search_threat_activity
  // -------------------------------------------------------------------------
  server.tool(
    "search_threat_activity",
    "Search for threat indicator matches in InsightIDR logs — find where known IOCs have been seen",
    {
      indicator_value: z
        .string()
        .optional()
        .describe("Specific indicator value to search for"),
      indicator_type: z
        .enum([
          "IP",
          "DOMAIN",
          "URL",
          "HASH_MD5",
          "HASH_SHA1",
          "HASH_SHA256",
          "EMAIL",
          "PROCESS",
          "FILENAME",
        ])
        .optional()
        .describe("Filter by indicator type"),
      start_time: z
        .string()
        .optional()
        .describe("Filter matches after this ISO 8601 timestamp"),
      end_time: z
        .string()
        .optional()
        .describe("Filter matches before this ISO 8601 timestamp"),
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
    async ({ indicator_value, indicator_type, start_time, end_time, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (indicator_value) params.indicator_value = indicator_value;
        if (indicator_type) params.indicator_type = indicator_type;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;

        const response = await client.searchThreatActivity(params);

        const result = {
          threat_activity: response.data.map((ta) => ({
            id: ta.id,
            indicator_type: ta.indicator.type,
            indicator_value: ta.indicator.value,
            indicator_source: ta.indicator.source,
            indicator_threat_name: ta.indicator.threat_name,
            matched_log: {
              log_id: ta.matched_log.log_id,
              log_set: ta.matched_log.log_set,
              timestamp: ta.matched_log.timestamp,
              message: ta.matched_log.message,
            },
            asset_hostname: ta.asset?.hostname,
            asset_ip: ta.asset?.ip,
            user: ta.user,
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
