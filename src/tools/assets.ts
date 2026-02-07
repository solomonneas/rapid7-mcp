import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Rapid7Client } from "../client.js";

/**
 * Register asset management tools.
 *
 * Provides asset search, detail retrieval, and activity
 * tracking for endpoints monitored by InsightIDR.
 */
export function registerAssetTools(
  server: McpServer,
  client: Rapid7Client
): void {
  // -------------------------------------------------------------------------
  // search_assets
  // -------------------------------------------------------------------------
  server.tool(
    "search_assets",
    "Search InsightIDR assets (endpoints) by hostname, IP address, OS, or agent status",
    {
      hostname: z
        .string()
        .optional()
        .describe("Filter by hostname (partial match supported)"),
      ip_address: z
        .string()
        .optional()
        .describe("Filter by IP address"),
      os_type: z
        .string()
        .optional()
        .describe("Filter by OS type (e.g., 'Windows', 'Linux', 'macOS')"),
      agent_status: z
        .string()
        .optional()
        .describe("Filter by agent status (e.g., 'ACTIVE', 'INACTIVE', 'STALE')"),
      domain: z
        .string()
        .optional()
        .describe("Filter by Active Directory domain"),
      search: z
        .string()
        .optional()
        .describe("General search term across asset fields"),
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
    async ({ hostname, ip_address, os_type, agent_status, domain, search, size, index }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
          index,
        };
        if (hostname) params.hostname = hostname;
        if (ip_address) params.ip_address = ip_address;
        if (os_type) params.os_type = os_type;
        if (agent_status) params.agent_status = agent_status;
        if (domain) params.domain = domain;
        if (search) params.search = search;

        const response = await client.getAssets(params);

        const result = {
          assets: response.data.map((asset) => ({
            id: asset.id,
            rrn: asset.rrn,
            hostname: asset.hostname,
            ip_addresses: asset.ip_addresses,
            os_name: asset.os?.name,
            os_version: asset.os?.version,
            os_type: asset.os?.type,
            agent_status: asset.agent?.status,
            agent_version: asset.agent?.version,
            agent_last_seen: asset.agent?.last_seen,
            domain: asset.domain,
            first_seen: asset.first_seen,
            last_seen: asset.last_seen,
            tags: asset.tags,
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
  // get_asset
  // -------------------------------------------------------------------------
  server.tool(
    "get_asset",
    "Get full details of an InsightIDR asset including installed software, vulnerabilities, and network interfaces",
    {
      asset_id: z
        .string()
        .describe("Asset ID or RRN"),
    },
    async ({ asset_id }) => {
      try {
        const response = await client.getAsset(asset_id);
        const asset = response.data;

        const result = {
          id: asset.id,
          rrn: asset.rrn,
          hostname: asset.hostname,
          hostnames: asset.hostnames,
          ip_addresses: asset.ip_addresses,
          mac_addresses: asset.mac_addresses,
          os: asset.os,
          agent: asset.agent,
          domain: asset.domain,
          first_seen: asset.first_seen,
          last_seen: asset.last_seen,
          network_interfaces: asset.network_interfaces?.map((nic) => ({
            name: nic.name,
            ip_addresses: nic.ip_addresses,
            mac_address: nic.mac_address,
          })),
          installed_software: asset.installed_software?.map((sw) => ({
            name: sw.name,
            version: sw.version,
            vendor: sw.vendor,
          })),
          installed_software_count: asset.installed_software?.length ?? 0,
          vulnerabilities: asset.vulnerabilities?.map((vuln) => ({
            id: vuln.id,
            cve: vuln.cve,
            title: vuln.title,
            severity: vuln.severity,
            risk_score: vuln.risk_score,
          })),
          vulnerability_count: asset.vulnerabilities?.length ?? 0,
          tags: asset.tags,
          organization_id: asset.organization_id,
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
  // get_asset_activity
  // -------------------------------------------------------------------------
  server.tool(
    "get_asset_activity",
    "Get recent activity for an asset including logins, processes, and network connections",
    {
      asset_id: z
        .string()
        .describe("Asset ID or RRN"),
      activity_type: z
        .enum(["LOGIN", "PROCESS", "CONNECTION", "ALL"])
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
    async ({ asset_id, activity_type, start_time, end_time, size }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          size,
        };
        if (activity_type !== "ALL") params.type = activity_type;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;

        const response = await client.getAssetActivity(asset_id, params);

        const result = {
          asset_id,
          activity_type,
          activities: response.data.map((act) => ({
            timestamp: act.timestamp,
            type: act.type,
            description: act.description,
            user: act.user,
            source_ip: act.source_ip,
            destination_ip: act.destination_ip,
            process: act.process,
            port: act.port,
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
}
