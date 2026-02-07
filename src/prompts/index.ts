import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register MCP prompts for common InsightIDR investigation
 * and threat-hunting workflows.
 */
export function registerPrompts(server: McpServer): void {
  // -------------------------------------------------------------------------
  // investigate-alert
  // -------------------------------------------------------------------------
  server.prompt(
    "investigate-alert",
    "Guided workflow for investigating an InsightIDR alert — gathers context, evidence, and recommends actions",
    {
      alert_id: z
        .string()
        .describe("The alert ID or RRN to investigate"),
    },
    ({ alert_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Investigate InsightIDR alert ${alert_id}. Follow this structured workflow:`,
              "",
              "## Phase 1: Context Gathering",
              "1. Use **get_alert** to retrieve the full alert details",
              "2. Use **get_alert_evidence** to examine indicators and events",
              "3. If linked to an investigation, use **get_investigation** to review it",
              "",
              "## Phase 2: Asset & User Analysis",
              "4. Identify affected assets from the evidence and use **get_asset** for each",
              "5. Use **get_asset_activity** to review recent activity on affected endpoints",
              "6. If a user is involved, use **get_user_activity** to check their behavior",
              "7. Use **get_risky_users** to see if the user has elevated risk scores",
              "",
              "## Phase 3: Log Investigation",
              "8. Use **list_log_sets** to identify relevant log sources",
              "9. Use **search_logs** with targeted LEQL queries to pivot on IOCs found in evidence",
              "10. Cross-reference indicators across multiple log sets (firewall, DNS, endpoint)",
              "",
              "## Phase 4: Threat Intelligence",
              "11. Use **list_threat_indicators** to check if any evidence IOCs are known threats",
              "12. Use **search_threat_activity** to find other systems affected by the same IOCs",
              "",
              "## Phase 5: Analysis & Response",
              "13. Determine the severity and potential business impact",
              "14. Map findings to MITRE ATT&CK techniques",
              "15. Provide specific containment and remediation recommendations",
              "16. Suggest detection improvements to catch similar attacks",
              "17. Use **update_alert_status** to update the alert as INVESTIGATING",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // -------------------------------------------------------------------------
  // hunt-ioc
  // -------------------------------------------------------------------------
  server.prompt(
    "hunt-ioc",
    "Search for an IOC (IP, domain, hash, etc.) across all InsightIDR log sources and threat intelligence",
    {
      indicator_type: z
        .enum(["IP", "DOMAIN", "URL", "HASH_MD5", "HASH_SHA1", "HASH_SHA256", "EMAIL"])
        .describe("Type of indicator to hunt for"),
      indicator_value: z
        .string()
        .describe("The indicator value to search for"),
    },
    ({ indicator_type, indicator_value }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Hunt for IOC across all InsightIDR data sources:`,
              `- **Type:** ${indicator_type}`,
              `- **Value:** ${indicator_value}`,
              "",
              "## Step 1: Threat Intelligence Check",
              "1. Use **list_threat_indicators** to check if this IOC is already in the threat library",
              "2. Use **search_threat_activity** to find any existing matches in logs",
              "",
              "## Step 2: Log Search Across Sources",
              "3. Use **list_log_sets** to get all available log sets",
              "4. For each relevant log set, use **search_logs** with appropriate LEQL queries:",
              "",
              indicator_type === "IP"
                ? [
                    "   **Network logs:**",
                    `   \`where(source_address = ${indicator_value} OR destination_address = ${indicator_value})\``,
                    "",
                    "   **DNS logs:**",
                    `   \`where(source_address = ${indicator_value})\``,
                    "",
                    "   **Authentication logs:**",
                    `   \`where(source_address = ${indicator_value})\``,
                  ].join("\n")
                : indicator_type === "DOMAIN"
                  ? [
                      "   **DNS logs:**",
                      `   \`where(query CONTAINS "${indicator_value}")\``,
                      "",
                      "   **Web proxy logs:**",
                      `   \`where(host CONTAINS "${indicator_value}")\``,
                      "",
                      "   **Email logs:**",
                      `   \`where(sender_domain = "${indicator_value}")\``,
                    ].join("\n")
                  : [
                      "   **Endpoint logs:**",
                      `   \`where(file_hash = "${indicator_value}")\``,
                      "",
                      "   **Process logs:**",
                      `   \`where(file_hash = "${indicator_value}" OR process_hash = "${indicator_value}")\``,
                    ].join("\n"),
              "",
              "## Step 3: Impact Assessment",
              "5. For any hits, use **get_asset** on affected systems",
              "6. Use **get_user_activity** for any associated users",
              "7. Use **list_alerts** to find related alerts",
              "",
              "## Step 4: Response",
              "8. If the IOC is not in the threat library, use **add_threat_indicator** to add it",
              "9. Summarize findings: affected systems, users, timeline of activity",
              "10. Recommend containment actions based on the scope of exposure",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // -------------------------------------------------------------------------
  // user-behavior-review
  // -------------------------------------------------------------------------
  server.prompt(
    "user-behavior-review",
    "Analyze a user's activity for anomalies using InsightIDR's User Behavior Analytics",
    {
      user_identifier: z
        .string()
        .describe("User name, email, or ID to review"),
    },
    ({ user_identifier }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Perform a user behavior review for: ${user_identifier}`,
              "",
              "## Step 1: User Profile",
              "1. Use **search_users** to find the user account",
              "2. Note their department, title, groups, and normal access patterns",
              "3. Check if they appear in **get_risky_users** results",
              "",
              "## Step 2: Authentication Analysis",
              "4. Use **get_user_activity** with type=LOGIN to review login patterns:",
              "   - Normal login hours vs. current login times",
              "   - Login locations and source IPs",
              "   - Authentication methods (password, MFA, SSO)",
              "   - Failed login attempts before successful ones",
              "",
              "## Step 3: Asset Access Review",
              "5. Use **get_user_activity** with type=ASSET_ACCESS to check:",
              "   - What systems did they access?",
              "   - Any first-time access to critical systems?",
              "   - Unusual file server or database access?",
              "",
              "## Step 4: Log Search Deep Dive",
              "6. Use **search_logs** against relevant log sets:",
              `   - Authentication: \`where(user = "${user_identifier}")\``,
              `   - Endpoint: \`where(user = "${user_identifier}") groupby(process_name) calculate(count)\``,
              `   - Data transfer: \`where(user = "${user_identifier}") calculate(sum:bytes_sent)\``,
              "",
              "## Step 5: Related Alerts",
              "7. Use **list_alerts** to check for alerts involving this user",
              "",
              "## Step 6: Assessment",
              "8. Compare current behavior against baselines",
              "9. Identify specific anomalies with timestamps",
              "10. Rate the risk level (LOW/MEDIUM/HIGH/CRITICAL)",
              "11. Recommend whether to escalate, monitor, or close",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // -------------------------------------------------------------------------
  // incident-timeline
  // -------------------------------------------------------------------------
  server.prompt(
    "incident-timeline",
    "Build a chronological incident timeline from an InsightIDR investigation, correlating alerts, logs, and user activity",
    {
      investigation_id: z
        .string()
        .describe("Investigation ID or RRN to build the timeline for"),
    },
    ({ investigation_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Build a comprehensive incident timeline for investigation ${investigation_id}.`,
              "",
              "## Step 1: Investigation Context",
              "1. Use **get_investigation** to get the full investigation details and its built-in timeline",
              "2. Use **get_investigation_alerts** to retrieve all associated alerts",
              "",
              "## Step 2: Alert Evidence Collection",
              "3. For each alert, use **get_alert** and **get_alert_evidence** to collect:",
              "   - Timestamps of first and last events",
              "   - Indicators (IPs, hashes, domains)",
              "   - Affected assets and users",
              "",
              "## Step 3: Log Correlation",
              "4. Using the timestamps and IOCs from the alerts:",
              "   - Search surrounding timeframes with **search_logs** (+/- 1 hour from each alert)",
              "   - Look for related activity that wasn't flagged by alerts",
              "   - Search for lateral movement between affected assets",
              "",
              "## Step 4: User & Asset Context",
              "5. For affected users, use **get_user_activity** to fill timeline gaps",
              "6. For affected assets, use **get_asset_activity** for system-level events",
              "",
              "## Step 5: Timeline Assembly",
              "7. Merge all events into a single chronological timeline:",
              "   - Include: timestamp, event type, source, description, affected entity",
              "   - Group related events into attack phases",
              "   - Map each phase to MITRE ATT&CK tactics",
              "",
              "## Step 6: Narrative",
              "8. Write a clear incident narrative covering:",
              "   - Initial access vector and first indicator of compromise",
              "   - Attack progression (what happened, in what order)",
              "   - Scope of impact (which systems and data were affected)",
              "   - Current status and recommended next steps",
              "",
              "9. Add the timeline summary as a comment using **add_investigation_comment**",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
