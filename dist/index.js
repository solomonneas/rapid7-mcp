#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/config.ts
var REGION_URLS = {
  us: "https://us.api.insight.rapid7.com",
  us2: "https://us2.api.insight.rapid7.com",
  us3: "https://us3.api.insight.rapid7.com",
  eu: "https://eu.api.insight.rapid7.com",
  ca: "https://ca.api.insight.rapid7.com",
  au: "https://au.api.insight.rapid7.com",
  ap: "https://ap.api.insight.rapid7.com"
};
function getConfig() {
  const apiKey = process.env.RAPID7_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RAPID7_API_KEY environment variable is required. Generate an API key from InsightIDR > Settings > API Keys."
    );
  }
  const region = (process.env.RAPID7_REGION || "us").toLowerCase();
  let baseUrl = process.env.RAPID7_BASE_URL;
  if (!baseUrl) {
    baseUrl = REGION_URLS[region];
    if (!baseUrl) {
      throw new Error(
        `Unknown RAPID7_REGION '${region}'. Valid regions: ${Object.keys(REGION_URLS).join(", ")}. Or set RAPID7_BASE_URL directly.`
      );
    }
  }
  const timeout = parseInt(process.env.RAPID7_TIMEOUT ?? "30", 10) * 1e3;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    region,
    timeout
  };
}

// src/client.ts
var Rapid7ClientError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "Rapid7ClientError";
  }
};
var Rapid7AuthError = class extends Rapid7ClientError {
  constructor(message, statusCode) {
    super(message, statusCode);
    this.name = "Rapid7AuthError";
  }
};
var Rapid7RateLimitError = class extends Rapid7ClientError {
  retryAfter;
  constructor(message, retryAfter) {
    super(message, 429);
    this.name = "Rapid7RateLimitError";
    this.retryAfter = retryAfter;
  }
};
var Rapid7Client = class {
  baseUrl;
  apiKey;
  timeout;
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
  }
  // --------------------------------------------------------------------------
  // Core HTTP
  // --------------------------------------------------------------------------
  createAbortSignal() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId)
    };
  }
  /**
   * Send an authenticated request to the InsightIDR API.
   */
  async request(method, endpoint, params, body) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== void 0 && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const headers = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    const { signal, clear } = this.createAbortSignal();
    let response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal
      });
    } catch (error) {
      clear();
      if (error instanceof Error && error.name === "AbortError") {
        throw new Rapid7ClientError(
          `InsightIDR API timeout after ${this.timeout}ms`
        );
      }
      throw error;
    }
    clear();
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }
    if (response.status === 204) {
      return {};
    }
    return await response.json();
  }
  async handleErrorResponse(response) {
    let errorMsg = `${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMsg = `${errorMsg}: ${errorBody.message}`;
      }
    } catch {
    }
    if (response.status === 401 || response.status === 403) {
      throw new Rapid7AuthError(
        `Authentication failed: ${errorMsg}`,
        response.status
      );
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Rapid7RateLimitError(
        `Rate limited: ${errorMsg}`,
        retryAfter ? parseInt(retryAfter, 10) : void 0
      );
    }
    throw new Rapid7ClientError(
      `Request failed: ${errorMsg}`,
      response.status
    );
  }
  async get(endpoint, params) {
    return this.request("GET", endpoint, params);
  }
  async post(endpoint, body, params) {
    return this.request("POST", endpoint, params, body);
  }
  async put(endpoint, body, params) {
    return this.request("PUT", endpoint, params, body);
  }
  async patch(endpoint, body, params) {
    return this.request("PATCH", endpoint, params, body);
  }
  // --------------------------------------------------------------------------
  // Investigation Methods
  // --------------------------------------------------------------------------
  /** List investigations with optional filters */
  async getInvestigations(params = {}) {
    return this.get("/idr/v2/investigations", params);
  }
  /** Get a single investigation by RRN */
  async getInvestigation(investigationId) {
    return this.get(`/idr/v2/investigations/${investigationId}`);
  }
  /** Create a new investigation */
  async createInvestigation(body) {
    return this.post("/idr/v2/investigations", body);
  }
  /** Update an existing investigation */
  async updateInvestigation(investigationId, body) {
    return this.patch(`/idr/v2/investigations/${investigationId}`, body);
  }
  /** Add a comment to an investigation */
  async addInvestigationComment(investigationId, body) {
    return this.post(
      `/idr/v2/investigations/${investigationId}/comments`,
      body
    );
  }
  /** Get the timeline of an investigation */
  async getInvestigationTimeline(investigationId, params = {}) {
    return this.get(
      `/idr/v2/investigations/${investigationId}/timeline`,
      params
    );
  }
  /** Get alerts associated with an investigation */
  async getInvestigationAlerts(investigationId, params = {}) {
    return this.get(
      `/idr/v2/investigations/${investigationId}/alerts`,
      params
    );
  }
  // --------------------------------------------------------------------------
  // Log Search Methods
  // --------------------------------------------------------------------------
  /** Execute a LEQL query against a log set */
  async searchLogs(logSetId, body) {
    return this.post(`/log_search/query/logsets/${logSetId}`, body);
  }
  /** List available log sets */
  async getLogSets() {
    return this.get("/log_search/management/logsets");
  }
  /** Get a specific log entry */
  async getLogEntry(logSetId, logId) {
    return this.get(`/log_search/query/logsets/${logSetId}/entries/${logId}`);
  }
  /** Get aggregate log statistics */
  async getLogStats(logSetId, body) {
    return this.post(`/log_search/query/logsets/${logSetId}/stats`, body);
  }
  // --------------------------------------------------------------------------
  // Alert Methods
  // --------------------------------------------------------------------------
  /** List alerts with optional filters */
  async getAlerts(params = {}) {
    return this.get("/idr/v2/alerts", params);
  }
  /** Get a single alert by RRN */
  async getAlert(alertId) {
    return this.get(`/idr/v2/alerts/${alertId}`);
  }
  /** Update an alert's status */
  async updateAlertStatus(alertId, body) {
    return this.patch(`/idr/v2/alerts/${alertId}`, body);
  }
  /** Get evidence associated with an alert */
  async getAlertEvidence(alertId, params = {}) {
    return this.get(`/idr/v2/alerts/${alertId}/evidence`, params);
  }
  // --------------------------------------------------------------------------
  // Asset Methods
  // --------------------------------------------------------------------------
  /** Search assets with filters */
  async getAssets(params = {}) {
    return this.get("/idr/v2/assets", params);
  }
  /** Get a single asset by ID */
  async getAsset(assetId) {
    return this.get(`/idr/v2/assets/${assetId}`);
  }
  /** Get recent activity for an asset */
  async getAssetActivity(assetId, params = {}) {
    return this.get(`/idr/v2/assets/${assetId}/activity`, params);
  }
  // --------------------------------------------------------------------------
  // User Methods
  // --------------------------------------------------------------------------
  /** Search user accounts */
  async getUsers(params = {}) {
    return this.get("/idr/v2/accounts", params);
  }
  /** Get activity for a specific user */
  async getUserActivity(userId, params = {}) {
    return this.get(`/idr/v2/accounts/${userId}/activity`, params);
  }
  /** Get users with elevated risk scores */
  async getRiskyUsers(params = {}) {
    return this.get("/idr/v2/accounts/risky", params);
  }
  // --------------------------------------------------------------------------
  // Threat Methods
  // --------------------------------------------------------------------------
  /** List threat indicators from the threat library */
  async getThreatIndicators(params = {}) {
    return this.get("/idr/v2/threat_indicators", params);
  }
  /** Add a threat indicator to the library */
  async addThreatIndicator(body) {
    return this.post("/idr/v2/threat_indicators", body);
  }
  /** Search for threat indicator matches in logs */
  async searchThreatActivity(params = {}) {
    return this.get("/idr/v2/threat_indicators/activity", params);
  }
  // --------------------------------------------------------------------------
  // Saved Query Methods
  // --------------------------------------------------------------------------
  /** List saved LEQL queries */
  async getSavedQueries(params = {}) {
    return this.get("/log_search/management/saved_queries", params);
  }
  /** Create a saved LEQL query */
  async createSavedQuery(body) {
    return this.post("/log_search/management/saved_queries", body);
  }
};

// src/tools/investigations.ts
import { z } from "zod";
function registerInvestigationTools(server, client) {
  server.tool(
    "search_investigations",
    "List and filter InsightIDR investigations by status, priority, assignee, or date range",
    {
      status: z.enum(["OPEN", "INVESTIGATING", "WAITING", "CLOSED"]).optional().describe("Filter by investigation status"),
      priority: z.enum(["UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("Filter by priority level"),
      assignee_email: z.string().optional().describe("Filter by assignee email address"),
      start_time: z.string().optional().describe("Filter investigations created after this ISO 8601 timestamp"),
      end_time: z.string().optional().describe("Filter investigations created before this ISO 8601 timestamp"),
      sort: z.string().optional().describe("Sort field (e.g., 'created_time' or '-created_time' for descending)"),
      size: z.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ status, priority, assignee_email, start_time, end_time, sort, size, index }) => {
      try {
        const params = {
          size,
          index
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
            tags: inv.tags
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_investigation",
    "Get full details of a specific InsightIDR investigation including its timeline",
    {
      investigation_id: z.string().describe("Investigation ID or RRN")
    },
    async ({ investigation_id }) => {
      try {
        const [invResponse, timelineResponse] = await Promise.all([
          client.getInvestigation(investigation_id),
          client.getInvestigationTimeline(investigation_id).catch(() => ({
            data: []
          }))
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
          timeline: timelineResponse.data
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "create_investigation",
    "Create a new InsightIDR investigation with a title, priority, and status",
    {
      title: z.string().min(1).max(256).describe("Investigation title"),
      priority: z.enum(["UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM").describe("Investigation priority"),
      status: z.enum(["OPEN", "INVESTIGATING", "WAITING", "CLOSED"]).default("OPEN").describe("Initial investigation status"),
      disposition: z.enum(["BENIGN", "MALICIOUS", "NOT_APPLICABLE", "UNDECIDED"]).optional().describe("Investigation disposition (typically set when closing)"),
      assignee_email: z.string().email().optional().describe("Email of the user to assign the investigation to")
    },
    async ({ title, priority, status, disposition, assignee_email }) => {
      try {
        const body = {
          title,
          priority,
          status
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
          message: "Investigation created successfully"
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "update_investigation",
    "Update an existing investigation's status, priority, assignee, or disposition",
    {
      investigation_id: z.string().describe("Investigation ID or RRN"),
      status: z.enum(["OPEN", "INVESTIGATING", "WAITING", "CLOSED"]).optional().describe("New investigation status"),
      priority: z.enum(["UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("New investigation priority"),
      disposition: z.enum(["BENIGN", "MALICIOUS", "NOT_APPLICABLE", "UNDECIDED"]).optional().describe("Investigation disposition"),
      assignee_email: z.string().email().optional().describe("Email of the new assignee"),
      title: z.string().min(1).max(256).optional().describe("New investigation title")
    },
    async ({ investigation_id, status, priority, disposition, assignee_email, title }) => {
      try {
        const body = {};
        if (status) body.status = status;
        if (priority) body.priority = priority;
        if (disposition) body.disposition = disposition;
        if (assignee_email) body.assignee = { email: assignee_email };
        if (title) body.title = title;
        if (Object.keys(body).length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "At least one field must be provided to update"
                })
              }
            ],
            isError: true
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
          message: "Investigation updated successfully"
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "add_investigation_comment",
    "Add a comment or note to an InsightIDR investigation",
    {
      investigation_id: z.string().describe("Investigation ID or RRN"),
      body: z.string().min(1).describe("Comment text to add"),
      visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC").describe("Comment visibility")
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
          message: "Comment added successfully"
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_investigation_alerts",
    "Get all alerts associated with a specific investigation",
    {
      investigation_id: z.string().describe("Investigation ID or RRN"),
      size: z.number().int().min(1).max(100).default(20).describe("Number of alerts to return (1-100)"),
      index: z.number().int().min(0).default(0).describe("Pagination index")
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
            latest_event_time: alert.latest_event_time
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/logs.ts
import { z as z2 } from "zod";
function registerLogTools(server, client) {
  server.tool(
    "search_logs",
    "Execute a LEQL (Log Entry Query Language) query against a specific log set in InsightIDR",
    {
      log_set_id: z2.string().describe(
        "ID of the log set to search. Use list_log_sets to find available log sets."
      ),
      query: z2.string().describe(
        "LEQL query statement (e.g., 'where(source_address = 10.0.0.1)', 'where(action = BLOCK) groupby(source_address) calculate(count)')"
      ),
      from: z2.number().optional().describe("Start time as Unix timestamp in milliseconds"),
      to: z2.number().optional().describe("End time as Unix timestamp in milliseconds"),
      time_range: z2.string().optional().describe(
        "Relative time range (e.g., 'Last 1 Hour', 'Last 24 Hours', 'Last 7 Days'). Used when from/to are not specified."
      ),
      per_page: z2.number().int().min(1).max(500).default(50).describe("Number of log entries per page (1-500)")
    },
    async ({ log_set_id, query, from, to, time_range, per_page }) => {
      try {
        const body = {
          leql: { statement: query },
          per_page
        };
        if (from !== void 0 && to !== void 0) {
          body.during = { from, to };
        } else if (time_range) {
          body.during = { time_range };
        } else {
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
            labels: event.labels
          })),
          event_count: response.events.length,
          statistics: response.statistics ? {
            from: response.statistics.from ? new Date(response.statistics.from).toISOString() : void 0,
            to: response.statistics.to ? new Date(response.statistics.to).toISOString() : void 0,
            count: response.statistics.count,
            groups: response.statistics.groups,
            stats: response.statistics.stats
          } : void 0,
          time_range: response.leql?.during?.time_range || `${from} - ${to}`
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
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
            retention_period: ls.retention_period
          })),
          total: response.logsets.length
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_log_entry",
    "Retrieve a specific log entry by its ID from a given log set",
    {
      log_set_id: z2.string().describe("ID of the log set containing the entry"),
      log_id: z2.string().describe("ID of the specific log entry")
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
          sequence_number: entry.sequence_number
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_log_stats",
    "Get aggregate statistics for a log set over a time range using a LEQL query",
    {
      log_set_id: z2.string().describe("ID of the log set"),
      query: z2.string().default("calculate(count)").describe("LEQL query for aggregation (e.g., 'groupby(source_address) calculate(count)')"),
      from: z2.number().optional().describe("Start time as Unix timestamp in milliseconds"),
      to: z2.number().optional().describe("End time as Unix timestamp in milliseconds"),
      time_range: z2.string().optional().describe("Relative time range (e.g., 'Last 24 Hours', 'Last 7 Days')")
    },
    async ({ log_set_id, query, from, to, time_range }) => {
      try {
        const body = {
          leql: { statement: query }
        };
        if (from !== void 0 && to !== void 0) {
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
            from: response.statistics.from ? new Date(response.statistics.from).toISOString() : void 0,
            to: response.statistics.to ? new Date(response.statistics.to).toISOString() : void 0,
            count: response.statistics.count,
            granularity: response.statistics.granularity,
            timeseries: response.statistics.timeseries,
            groups: response.statistics.groups,
            stats: response.statistics.stats
          }
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/alerts.ts
import { z as z3 } from "zod";
function registerAlertTools(server, client) {
  server.tool(
    "list_alerts",
    "List InsightIDR alerts with optional filters for severity, type, status, and date range",
    {
      severity: z3.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("Filter by alert severity"),
      type: z3.enum(["ENDPOINT", "UBA", "NETWORK", "LOG", "CLOUD", "CUSTOM", "HONEYPOT", "DECEPTION"]).optional().describe("Filter by alert type/source"),
      status: z3.enum(["OPEN", "INVESTIGATING", "CLOSED"]).optional().describe("Filter by alert status"),
      start_time: z3.string().optional().describe("Filter alerts created after this ISO 8601 timestamp"),
      end_time: z3.string().optional().describe("Filter alerts created before this ISO 8601 timestamp"),
      investigation_id: z3.string().optional().describe("Filter alerts linked to a specific investigation"),
      sort: z3.string().optional().describe("Sort field (e.g., '-created_time' for newest first)"),
      size: z3.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z3.number().int().min(0).default(0).describe("Pagination index")
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
      index
    }) => {
      try {
        const params = {
          size,
          index
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
            latest_event_time: alert.latest_event_time
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_alert",
    "Get full details of a specific InsightIDR alert including its detection rule and metadata",
    {
      alert_id: z3.string().describe("Alert ID or RRN")
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
          version: alert.version
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "update_alert_status",
    "Update the status of an InsightIDR alert (open, investigating, or closed)",
    {
      alert_id: z3.string().describe("Alert ID or RRN"),
      status: z3.enum(["OPEN", "INVESTIGATING", "CLOSED"]).describe("New alert status"),
      assignee_email: z3.string().email().optional().describe("Email of the user to assign to")
    },
    async ({ alert_id, status, assignee_email }) => {
      try {
        const body = { status };
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
          message: `Alert status updated to ${status}`
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_alert_evidence",
    "Get evidence and indicators associated with an InsightIDR alert",
    {
      alert_id: z3.string().describe("Alert ID or RRN")
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
            last_seen: ind.last_seen
          })),
          indicator_count: evidence.indicators.length,
          events: evidence.events.map((evt) => ({
            id: evt.id,
            timestamp: evt.timestamp,
            type: evt.type,
            data: evt.data
          })),
          event_count: evidence.events.length
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/assets.ts
import { z as z4 } from "zod";
function registerAssetTools(server, client) {
  server.tool(
    "search_assets",
    "Search InsightIDR assets (endpoints) by hostname, IP address, OS, or agent status",
    {
      hostname: z4.string().optional().describe("Filter by hostname (partial match supported)"),
      ip_address: z4.string().optional().describe("Filter by IP address"),
      os_type: z4.string().optional().describe("Filter by OS type (e.g., 'Windows', 'Linux', 'macOS')"),
      agent_status: z4.string().optional().describe("Filter by agent status (e.g., 'ACTIVE', 'INACTIVE', 'STALE')"),
      domain: z4.string().optional().describe("Filter by Active Directory domain"),
      search: z4.string().optional().describe("General search term across asset fields"),
      size: z4.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z4.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ hostname, ip_address, os_type, agent_status, domain, search, size, index }) => {
      try {
        const params = {
          size,
          index
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
            tags: asset.tags
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_asset",
    "Get full details of an InsightIDR asset including installed software, vulnerabilities, and network interfaces",
    {
      asset_id: z4.string().describe("Asset ID or RRN")
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
            mac_address: nic.mac_address
          })),
          installed_software: asset.installed_software?.map((sw) => ({
            name: sw.name,
            version: sw.version,
            vendor: sw.vendor
          })),
          installed_software_count: asset.installed_software?.length ?? 0,
          vulnerabilities: asset.vulnerabilities?.map((vuln) => ({
            id: vuln.id,
            cve: vuln.cve,
            title: vuln.title,
            severity: vuln.severity,
            risk_score: vuln.risk_score
          })),
          vulnerability_count: asset.vulnerabilities?.length ?? 0,
          tags: asset.tags,
          organization_id: asset.organization_id
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_asset_activity",
    "Get recent activity for an asset including logins, processes, and network connections",
    {
      asset_id: z4.string().describe("Asset ID or RRN"),
      activity_type: z4.enum(["LOGIN", "PROCESS", "CONNECTION", "ALL"]).default("ALL").describe("Type of activity to retrieve"),
      start_time: z4.string().optional().describe("Filter activity after this ISO 8601 timestamp"),
      end_time: z4.string().optional().describe("Filter activity before this ISO 8601 timestamp"),
      size: z4.number().int().min(1).max(100).default(50).describe("Number of activity records to return (1-100)")
    },
    async ({ asset_id, activity_type, start_time, end_time, size }) => {
      try {
        const params = {
          size
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
            port: act.port
          })),
          total: response.data.length
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/users.ts
import { z as z5 } from "zod";
function registerUserTools(server, client) {
  server.tool(
    "search_users",
    "Search user accounts monitored by InsightIDR by name, email, domain, or department",
    {
      name: z5.string().optional().describe("Filter by user display name (partial match)"),
      email: z5.string().optional().describe("Filter by email address"),
      domain: z5.string().optional().describe("Filter by Active Directory domain"),
      department: z5.string().optional().describe("Filter by department"),
      disabled: z5.boolean().optional().describe("Filter by account disabled status"),
      search: z5.string().optional().describe("General search across user fields"),
      size: z5.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z5.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ name, email, domain, department, disabled, search, size, index }) => {
      try {
        const params = {
          size,
          index
        };
        if (name) params.name = name;
        if (email) params.email = email;
        if (domain) params.domain = domain;
        if (department) params.department = department;
        if (disabled !== void 0) params.disabled = disabled;
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
            groups: user.groups
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_user_activity",
    "Get user behavior analytics data: login times, locations, accessed assets, and anomalies",
    {
      user_id: z5.string().describe("User ID or RRN"),
      activity_type: z5.enum(["LOGIN", "AUTHENTICATION", "ASSET_ACCESS", "SERVICE_ACCESS", "ALL"]).default("ALL").describe("Type of activity to retrieve"),
      start_time: z5.string().optional().describe("Filter activity after this ISO 8601 timestamp"),
      end_time: z5.string().optional().describe("Filter activity before this ISO 8601 timestamp"),
      size: z5.number().int().min(1).max(100).default(50).describe("Number of activity records to return (1-100)")
    },
    async ({ user_id, activity_type, start_time, end_time, size }) => {
      try {
        const params = {
          size
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
            service: act.service
          })),
          total: response.data.length
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "get_risky_users",
    "Get users with abnormal behavior scores from InsightIDR's User Behavior Analytics (UBA)",
    {
      min_risk_score: z5.number().min(0).max(100).optional().describe("Minimum risk score threshold (0-100)"),
      risk_level: z5.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("Filter by risk level"),
      size: z5.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z5.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ min_risk_score, risk_level, size, index }) => {
      try {
        const params = {
          size,
          index
        };
        if (min_risk_score !== void 0) params.min_risk_score = min_risk_score;
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
              weight: rf.weight
            })),
            anomaly_count: ru.anomalies.length,
            recent_anomalies: ru.anomalies.slice(0, 5).map((a) => ({
              type: a.type,
              description: a.description,
              timestamp: a.timestamp,
              severity: a.severity
            }))
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/threats.ts
import { z as z6 } from "zod";
function registerThreatTools(server, client) {
  server.tool(
    "list_threat_indicators",
    "List IOCs (IPs, domains, hashes) in the InsightIDR threat library",
    {
      type: z6.enum([
        "IP",
        "DOMAIN",
        "URL",
        "HASH_MD5",
        "HASH_SHA1",
        "HASH_SHA256",
        "EMAIL",
        "PROCESS",
        "FILENAME"
      ]).optional().describe("Filter by indicator type"),
      source: z6.string().optional().describe("Filter by indicator source (e.g., 'rapid7', 'custom', 'misp')"),
      threat_name: z6.string().optional().describe("Filter by associated threat name or campaign"),
      search: z6.string().optional().describe("Search across indicator values and descriptions"),
      size: z6.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z6.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ type, source, threat_name, search, size, index }) => {
      try {
        const params = {
          size,
          index
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
            tags: ind.tags
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "add_threat_indicator",
    "Add a new IOC (IP, domain, hash, etc.) to the InsightIDR custom threat library",
    {
      type: z6.enum([
        "IP",
        "DOMAIN",
        "URL",
        "HASH_MD5",
        "HASH_SHA1",
        "HASH_SHA256",
        "EMAIL",
        "PROCESS",
        "FILENAME"
      ]).describe("Type of indicator"),
      value: z6.string().min(1).describe("Indicator value (e.g., '10.0.0.1', 'malware.example.com', SHA256 hash)"),
      description: z6.string().optional().describe("Description of why this indicator is malicious"),
      threat_name: z6.string().optional().describe("Associated threat name or campaign"),
      severity: z6.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM").describe("Severity level of the threat"),
      tags: z6.array(z6.string()).optional().describe("Tags for categorization"),
      confidence: z6.number().min(0).max(100).optional().describe("Confidence score (0-100)")
    },
    async ({ type, value, description, threat_name, severity, tags, confidence }) => {
      try {
        const body = {
          type,
          value,
          source: "custom",
          severity
        };
        if (description) body.description = description;
        if (threat_name) body.threat_name = threat_name;
        if (tags) body.tags = tags;
        if (confidence !== void 0) body.confidence = confidence;
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
          message: "Threat indicator added successfully"
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "search_threat_activity",
    "Search for threat indicator matches in InsightIDR logs \u2014 find where known IOCs have been seen",
    {
      indicator_value: z6.string().optional().describe("Specific indicator value to search for"),
      indicator_type: z6.enum([
        "IP",
        "DOMAIN",
        "URL",
        "HASH_MD5",
        "HASH_SHA1",
        "HASH_SHA256",
        "EMAIL",
        "PROCESS",
        "FILENAME"
      ]).optional().describe("Filter by indicator type"),
      start_time: z6.string().optional().describe("Filter matches after this ISO 8601 timestamp"),
      end_time: z6.string().optional().describe("Filter matches before this ISO 8601 timestamp"),
      size: z6.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z6.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ indicator_value, indicator_type, start_time, end_time, size, index }) => {
      try {
        const params = {
          size,
          index
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
              message: ta.matched_log.message
            },
            asset_hostname: ta.asset?.hostname,
            asset_ip: ta.asset?.ip,
            user: ta.user
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/queries.ts
import { z as z7 } from "zod";
function registerQueryTools(server, client) {
  server.tool(
    "list_saved_queries",
    "List saved LEQL queries available in InsightIDR",
    {
      search: z7.string().optional().describe("Search saved queries by name or description"),
      size: z7.number().int().min(1).max(100).default(20).describe("Number of results to return (1-100)"),
      index: z7.number().int().min(0).default(0).describe("Pagination index")
    },
    async ({ search, size, index }) => {
      try {
        const params = {
          size,
          index
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
            creator: q.creator?.name
          })),
          total: response.metadata.total_data,
          size,
          index
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "create_saved_query",
    "Save a LEQL query for reuse in InsightIDR",
    {
      name: z7.string().min(1).max(256).describe("Name for the saved query"),
      description: z7.string().optional().describe("Description of what this query does"),
      leql_statement: z7.string().min(1).describe("LEQL query statement to save"),
      log_set_ids: z7.array(z7.string()).min(1).describe("Array of log set IDs this query applies to")
    },
    async ({ name, description, leql_statement, log_set_ids }) => {
      try {
        const body = {
          name,
          leql: { statement: leql_statement },
          logs: log_set_ids
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
          message: "Saved query created successfully"
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
  server.tool(
    "leql_help",
    "Get LEQL (Log Entry Query Language) syntax reference, examples, and common patterns for InsightIDR log searches",
    {
      topic: z7.enum(["overview", "where", "groupby", "calculate", "sort", "regex", "examples", "all"]).default("all").describe("Specific LEQL topic to get help on")
    },
    async ({ topic }) => {
      const sections = {
        overview: [
          "# LEQL (Log Entry Query Language) Overview",
          "",
          "LEQL is the query language used by Rapid7 InsightIDR for searching log data.",
          "Queries consist of clauses that filter, group, and calculate over log entries.",
          "",
          "Basic structure: where(<conditions>) groupby(<field>) calculate(<function>)",
          "",
          "Clauses can be chained: where \u2192 groupby \u2192 calculate \u2192 sort \u2192 limit"
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
          "```"
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
          "```"
        ].join("\n"),
        calculate: [
          "# CALCULATE Clause",
          "",
          "Performs aggregate calculations on results.",
          "",
          "## Functions",
          "- `count`  \u2014 Count of matching entries",
          "- `sum`    \u2014 Sum of a numeric field",
          "- `avg`    \u2014 Average of a numeric field",
          "- `min`    \u2014 Minimum value",
          "- `max`    \u2014 Maximum value",
          "- `unique` \u2014 Count distinct values",
          "- `bytes`  \u2014 Format byte sizes",
          "",
          "## Examples",
          "```",
          "calculate(count)",
          "groupby(source_address) calculate(count)",
          "where(action = ALLOW) calculate(sum:bytes_sent)",
          "groupby(user) calculate(unique:source_address)",
          "where(status >= 500) groupby(url) calculate(count)",
          "```"
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
          "```"
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
          "where(user_agent =~ /(?i)curl|wget|python/)",
          "where(source_address =~ /^10\\.0\\.0\\./)",
          "```"
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
          "```"
        ].join("\n")
      };
      try {
        let output;
        if (topic === "all") {
          output = Object.values(sections).join("\n\n---\n\n");
        } else {
          output = sections[topic] || `Unknown topic: ${topic}. Available: ${Object.keys(sections).join(", ")}`;
        }
        return {
          content: [{ type: "text", text: output }]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              })
            }
          ],
          isError: true
        };
      }
    }
  );
}

// src/resources/index.ts
function registerResources(server) {
  server.resource(
    "investigation-templates",
    "rapid7://investigation-templates",
    {
      description: "Common investigation templates for InsightIDR incidents including phishing, malware, lateral movement, and data exfiltration workflows",
      mimeType: "application/json"
    },
    async () => {
      const templates = [
        {
          name: "Phishing Investigation",
          priority: "HIGH",
          steps: [
            "Identify the phishing email (sender, subject, headers)",
            "Extract IOCs from the email (URLs, attachments, sender domain)",
            "Search logs for other recipients of the same email",
            "Check if any users clicked malicious links (web proxy logs)",
            "Search for downloaded malware hashes on endpoints",
            "Review user activity for compromised accounts",
            "Block malicious sender/domain in email gateway",
            "Add IOCs to threat library",
            "Notify affected users and reset credentials if needed"
          ],
          log_sets: ["Email Activity", "Web Proxy", "Endpoint Agent", "Authentication"],
          leql_queries: [
            'where(sender_domain = "malicious-domain.com")',
            'where(url CONTAINS "phishing-url")',
            'where(file_hash = "MALWARE_HASH")'
          ]
        },
        {
          name: "Malware Infection",
          priority: "CRITICAL",
          steps: [
            "Identify the infected endpoint and initial infection vector",
            "Quarantine the affected system",
            "Collect malware samples and extract IOCs",
            "Search for lateral movement from the infected host",
            "Check for C2 communication in network logs",
            "Scan all endpoints for the same malware hash",
            "Review process execution history on affected systems",
            "Block malicious IPs/domains at the firewall",
            "Remediate infected systems and restore from backup",
            "Update detection rules for the malware family"
          ],
          log_sets: ["Endpoint Agent", "Firewall", "DNS", "Web Proxy"],
          leql_queries: [
            'where(file_hash = "SAMPLE_HASH") groupby(hostname) calculate(count)',
            "where(source_address = INFECTED_IP AND destination_port NOT IN [80, 443])",
            'where(process_name = "suspicious.exe")'
          ]
        },
        {
          name: "Lateral Movement",
          priority: "HIGH",
          steps: [
            "Identify source and destination of suspicious lateral movement",
            "Check authentication logs for unusual login patterns",
            "Review RDP, SMB, WMI, and PSExec activity",
            "Look for pass-the-hash or pass-the-ticket indicators",
            "Map all systems accessed by the compromised account",
            "Check for privilege escalation attempts",
            "Review scheduled tasks and service installations",
            "Contain affected accounts and endpoints",
            "Force password resets for compromised accounts"
          ],
          log_sets: ["Active Directory", "Authentication", "Endpoint Agent", "Firewall"],
          leql_queries: [
            "where(event_type = AUTHENTICATION AND result = SUCCESS) groupby(source_address, destination_address) calculate(count)",
            "where(destination_port IN [3389, 445, 5985, 5986]) groupby(source_address) calculate(count)",
            'where(process_name IN ["psexec.exe", "wmic.exe", "powershell.exe"])'
          ]
        },
        {
          name: "Data Exfiltration",
          priority: "CRITICAL",
          steps: [
            "Identify the data source and exfiltration method",
            "Quantify the volume of data transferred",
            "Identify the external destination",
            "Review user access patterns leading up to exfiltration",
            "Check for unauthorized cloud storage uploads",
            "Look for DNS tunneling or steganography indicators",
            "Assess the sensitivity of exfiltrated data",
            "Block the exfiltration channel",
            "Notify legal/compliance teams if PII was involved",
            "Implement DLP rules to prevent recurrence"
          ],
          log_sets: ["Firewall", "Web Proxy", "DNS", "Cloud Services", "Endpoint Agent"],
          leql_queries: [
            "where(bytes_sent > 100000000) groupby(source_address, destination_address) calculate(sum:bytes_sent) sort(-sum)",
            "where(destination_port NOT IN [80, 443] AND bytes_sent > 1000000)",
            "where(query_type = TXT) groupby(query) calculate(count) sort(-count)"
          ]
        },
        {
          name: "Brute Force Attack",
          priority: "MEDIUM",
          steps: [
            "Identify the target account(s) and source IP(s)",
            "Determine if any logins were successful after failed attempts",
            "Check the geographic origin of the source IPs",
            "Look for credential stuffing patterns (many users, same source)",
            "Review account lockout events",
            "Block the attacking IP addresses",
            "Reset passwords for successfully compromised accounts",
            "Enable MFA if not already in place"
          ],
          log_sets: ["Authentication", "Active Directory", "VPN", "Web Application"],
          leql_queries: [
            "where(result = FAILED_LOGIN) groupby(user) calculate(count) sort(-count)",
            "where(result = FAILED_LOGIN) groupby(source_address) calculate(count) sort(-count)",
            "where(result = FAILED_LOGIN) groupby(source_address, user) calculate(count)"
          ]
        },
        {
          name: "Insider Threat",
          priority: "HIGH",
          steps: [
            "Review the user's access patterns over the past 30 days",
            "Check for unusual file access or downloads",
            "Look for after-hours activity or weekend logins",
            "Review USB device usage and removable media events",
            "Check cloud storage and email for large data transfers",
            "Compare behavior with peer group baselines",
            "Interview the user's manager for context",
            "Engage HR and legal if warranted"
          ],
          log_sets: ["Authentication", "Endpoint Agent", "Cloud Services", "Email Activity"],
          leql_queries: [
            'where(user = "TARGET_USER") groupby(type) calculate(count)',
            'where(user = "TARGET_USER" AND hour >= 22 OR hour <= 5)',
            'where(user = "TARGET_USER" AND bytes_sent > 10000000)'
          ]
        }
      ];
      return {
        contents: [
          {
            uri: "rapid7://investigation-templates",
            mimeType: "application/json",
            text: JSON.stringify({ templates, total: templates.length }, null, 2)
          }
        ]
      };
    }
  );
  server.resource(
    "leql-reference",
    "rapid7://leql-reference",
    {
      description: "LEQL (Log Entry Query Language) syntax reference with operators, functions, and common query patterns",
      mimeType: "application/json"
    },
    async () => {
      const reference = {
        overview: "LEQL (Log Entry Query Language) is the query language for searching log data in Rapid7 InsightIDR. Queries consist of clauses: where \u2192 groupby \u2192 calculate \u2192 sort \u2192 limit.",
        clauses: {
          where: {
            description: "Filter log entries by field conditions",
            operators: [
              { op: "=", description: "Equal to" },
              { op: "!=", description: "Not equal to" },
              { op: ">", description: "Greater than" },
              { op: ">=", description: "Greater than or equal" },
              { op: "<", description: "Less than" },
              { op: "<=", description: "Less than or equal" },
              { op: "CONTAINS", description: "Substring match" },
              { op: "STARTS WITH", description: "Prefix match" },
              { op: "ENDS WITH", description: "Suffix match" },
              { op: "IS / IS NOT", description: "Null checks" },
              { op: "IN / NOT IN", description: "Set membership" },
              { op: "=~", description: "Regex match" },
              { op: "!=~", description: "Negated regex match" }
            ],
            logical: ["AND", "OR", "NOT"]
          },
          groupby: {
            description: "Group results by one or more fields",
            syntax: "groupby(field1, field2, ...)"
          },
          calculate: {
            description: "Aggregate calculations on results",
            functions: [
              { fn: "count", description: "Count matching entries" },
              { fn: "sum", description: "Sum of a numeric field" },
              { fn: "avg", description: "Average of a numeric field" },
              { fn: "min", description: "Minimum value" },
              { fn: "max", description: "Maximum value" },
              { fn: "unique", description: "Count distinct values" },
              { fn: "bytes", description: "Format byte values" }
            ]
          },
          sort: {
            description: "Order results by a field",
            syntax: "sort(field) or sort(-field) for descending"
          },
          limit: {
            description: "Limit the number of results",
            syntax: "limit(N)"
          }
        },
        time_ranges: [
          "Last 5 Minutes",
          "Last 20 Minutes",
          "Last 1 Hour",
          "Last 4 Hours",
          "Last 8 Hours",
          "Last 24 Hours",
          "Last 2 Days",
          "Last 7 Days",
          "Last 14 Days",
          "Last 30 Days",
          "Last 90 Days"
        ],
        common_fields: {
          network: [
            "source_address",
            "destination_address",
            "source_port",
            "destination_port",
            "action",
            "protocol",
            "bytes_sent",
            "bytes_received"
          ],
          authentication: [
            "user",
            "result",
            "source_address",
            "destination_address",
            "service",
            "authentication_type"
          ],
          dns: [
            "query",
            "query_type",
            "response_code",
            "source_address",
            "destination_address"
          ],
          http: [
            "url",
            "method",
            "status",
            "user_agent",
            "source_address",
            "host",
            "content_type"
          ],
          endpoint: [
            "process_name",
            "parent_process",
            "command_line",
            "file_path",
            "file_hash",
            "user",
            "hostname"
          ]
        }
      };
      return {
        contents: [
          {
            uri: "rapid7://leql-reference",
            mimeType: "application/json",
            text: JSON.stringify(reference, null, 2)
          }
        ]
      };
    }
  );
  server.resource(
    "detection-rules",
    "rapid7://detection-rules",
    {
      description: "Built-in InsightIDR detection rule descriptions organized by attack category",
      mimeType: "application/json"
    },
    async () => {
      const detectionRules = {
        categories: [
          {
            name: "Attacker Behavior Analytics (ABA)",
            description: "Detects known attacker tools, techniques, and procedures based on network and endpoint data",
            rules: [
              {
                name: "ABA - Mimikatz Usage Detected",
                severity: "CRITICAL",
                mitre: ["T1003", "T1098"],
                description: "Detects execution or presence of Mimikatz credential dumping tool"
              },
              {
                name: "ABA - Cobalt Strike Beacon Communication",
                severity: "CRITICAL",
                mitre: ["T1071", "T1573"],
                description: "Identifies network traffic patterns consistent with Cobalt Strike beacon C2"
              },
              {
                name: "ABA - PowerShell Encoded Command Execution",
                severity: "HIGH",
                mitre: ["T1059.001", "T1027"],
                description: "Detects PowerShell execution with Base64 encoded commands"
              },
              {
                name: "ABA - Suspicious Scheduled Task Creation",
                severity: "MEDIUM",
                mitre: ["T1053.005"],
                description: "Detects creation of scheduled tasks commonly used for persistence"
              }
            ]
          },
          {
            name: "User Behavior Analytics (UBA)",
            description: "Detects anomalous user behavior through machine learning baselines",
            rules: [
              {
                name: "UBA - Anomalous Login Location",
                severity: "HIGH",
                mitre: ["T1078"],
                description: "User authenticated from a geographic location never seen before"
              },
              {
                name: "UBA - Impossible Travel",
                severity: "HIGH",
                mitre: ["T1078"],
                description: "User authenticated from two locations in a timeframe that would require impossible travel speed"
              },
              {
                name: "UBA - First Access to Critical Asset",
                severity: "MEDIUM",
                mitre: ["T1078"],
                description: "User accessed a critical server or service for the first time"
              },
              {
                name: "UBA - Abnormal Authentication Volume",
                severity: "MEDIUM",
                mitre: ["T1110"],
                description: "User generated an unusually high number of authentication events"
              }
            ]
          },
          {
            name: "Endpoint Detection",
            description: "Detects suspicious activity on endpoints monitored by the Insight Agent",
            rules: [
              {
                name: "EDR - Suspicious Process Injection",
                severity: "CRITICAL",
                mitre: ["T1055"],
                description: "Detected process injection techniques (DLL injection, process hollowing)"
              },
              {
                name: "EDR - Credential Dumping via LSASS",
                severity: "CRITICAL",
                mitre: ["T1003.001"],
                description: "Process accessed LSASS memory, indicating credential dumping attempt"
              },
              {
                name: "EDR - Ransomware File Encryption",
                severity: "CRITICAL",
                mitre: ["T1486"],
                description: "Mass file encryption activity detected consistent with ransomware behavior"
              },
              {
                name: "EDR - Living Off the Land Binary Usage",
                severity: "HIGH",
                mitre: ["T1218"],
                description: "Suspicious use of LOLBins (certutil, mshta, regsvr32) for malicious purposes"
              }
            ]
          },
          {
            name: "Network Detection",
            description: "Detects suspicious network traffic patterns and protocols",
            rules: [
              {
                name: "NET - DNS Tunneling Detected",
                severity: "HIGH",
                mitre: ["T1071.004"],
                description: "Unusually long or high-volume DNS queries suggesting DNS tunneling"
              },
              {
                name: "NET - Beaconing Activity",
                severity: "HIGH",
                mitre: ["T1071"],
                description: "Regular periodic outbound connections consistent with C2 beaconing"
              },
              {
                name: "NET - Large Data Transfer to External Host",
                severity: "MEDIUM",
                mitre: ["T1048"],
                description: "Unusually large volume of data transferred to an external destination"
              },
              {
                name: "NET - Connection to Known Malicious IP",
                severity: "HIGH",
                mitre: ["T1071"],
                description: "Network connection established to an IP address in threat intelligence feeds"
              }
            ]
          },
          {
            name: "Cloud Detection",
            description: "Detects suspicious activity in cloud services (AWS, Azure, GCP, O365)",
            rules: [
              {
                name: "CLOUD - Unusual API Call Volume",
                severity: "MEDIUM",
                mitre: ["T1078.004"],
                description: "Cloud account generated an unusually high number of API calls"
              },
              {
                name: "CLOUD - S3 Bucket Policy Change",
                severity: "HIGH",
                mitre: ["T1537"],
                description: "S3 bucket policy was modified to allow public access"
              },
              {
                name: "CLOUD - New Region Activity",
                severity: "MEDIUM",
                mitre: ["T1078.004"],
                description: "Cloud resources created in a region not previously used"
              },
              {
                name: "CLOUD - MFA Disabled for User",
                severity: "HIGH",
                mitre: ["T1556"],
                description: "Multi-factor authentication was disabled for a user account"
              }
            ]
          }
        ]
      };
      return {
        contents: [
          {
            uri: "rapid7://detection-rules",
            mimeType: "application/json",
            text: JSON.stringify(detectionRules, null, 2)
          }
        ]
      };
    }
  );
}

// src/prompts/index.ts
import { z as z8 } from "zod";
function registerPrompts(server) {
  server.prompt(
    "investigate-alert",
    "Guided workflow for investigating an InsightIDR alert \u2014 gathers context, evidence, and recommends actions",
    {
      alert_id: z8.string().describe("The alert ID or RRN to investigate")
    },
    ({ alert_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
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
              "17. Use **update_alert_status** to update the alert as INVESTIGATING"
            ].join("\n")
          }
        }
      ]
    })
  );
  server.prompt(
    "hunt-ioc",
    "Search for an IOC (IP, domain, hash, etc.) across all InsightIDR log sources and threat intelligence",
    {
      indicator_type: z8.enum(["IP", "DOMAIN", "URL", "HASH_MD5", "HASH_SHA1", "HASH_SHA256", "EMAIL"]).describe("Type of indicator to hunt for"),
      indicator_value: z8.string().describe("The indicator value to search for")
    },
    ({ indicator_type, indicator_value }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
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
              indicator_type === "IP" ? [
                "   **Network logs:**",
                `   \`where(source_address = ${indicator_value} OR destination_address = ${indicator_value})\``,
                "",
                "   **DNS logs:**",
                `   \`where(source_address = ${indicator_value})\``,
                "",
                "   **Authentication logs:**",
                `   \`where(source_address = ${indicator_value})\``
              ].join("\n") : indicator_type === "DOMAIN" ? [
                "   **DNS logs:**",
                `   \`where(query CONTAINS "${indicator_value}")\``,
                "",
                "   **Web proxy logs:**",
                `   \`where(host CONTAINS "${indicator_value}")\``,
                "",
                "   **Email logs:**",
                `   \`where(sender_domain = "${indicator_value}")\``
              ].join("\n") : [
                "   **Endpoint logs:**",
                `   \`where(file_hash = "${indicator_value}")\``,
                "",
                "   **Process logs:**",
                `   \`where(file_hash = "${indicator_value}" OR process_hash = "${indicator_value}")\``
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
              "10. Recommend containment actions based on the scope of exposure"
            ].join("\n")
          }
        }
      ]
    })
  );
  server.prompt(
    "user-behavior-review",
    "Analyze a user's activity for anomalies using InsightIDR's User Behavior Analytics",
    {
      user_identifier: z8.string().describe("User name, email, or ID to review")
    },
    ({ user_identifier }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
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
              "11. Recommend whether to escalate, monitor, or close"
            ].join("\n")
          }
        }
      ]
    })
  );
  server.prompt(
    "incident-timeline",
    "Build a chronological incident timeline from an InsightIDR investigation, correlating alerts, logs, and user activity",
    {
      investigation_id: z8.string().describe("Investigation ID or RRN to build the timeline for")
    },
    ({ investigation_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
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
              "9. Add the timeline summary as a comment using **add_investigation_comment**"
            ].join("\n")
          }
        }
      ]
    })
  );
}

// src/index.ts
async function main() {
  const config = getConfig();
  const client = new Rapid7Client(config);
  const server = new McpServer({
    name: "rapid7-mcp",
    version: "1.0.0",
    description: "MCP server for Rapid7 InsightIDR \u2014 investigate alerts, search logs with LEQL, manage investigations, track assets and users, and query threat intelligence"
  });
  registerInvestigationTools(server, client);
  registerLogTools(server, client);
  registerAlertTools(server, client);
  registerAssetTools(server, client);
  registerUserTools(server, client);
  registerThreatTools(server, client);
  registerQueryTools(server, client);
  registerResources(server);
  registerPrompts(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map