import type { Rapid7Config } from "./config.js";
import type {
  InsightIDRPaginatedResponse,
  Investigation,
  InvestigationComment,
  InvestigationTimeline,
  LogSet,
  LogEntry,
  LogSearchResponse,
  LogSearchStats,
  Alert,
  AlertEvidence,
  Asset,
  AssetActivity,
  User,
  UserActivity,
  RiskyUser,
  ThreatIndicator,
  ThreatActivity,
  SavedQuery,
} from "./types.js";

// ============================================================================
// Error Classes
// ============================================================================

/** Base error for all Rapid7 API errors */
export class Rapid7ClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "Rapid7ClientError";
  }
}

/** Authentication / authorization error */
export class Rapid7AuthError extends Rapid7ClientError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "Rapid7AuthError";
  }
}

/** Rate limit error */
export class Rapid7RateLimitError extends Rapid7ClientError {
  public retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message, 429);
    this.name = "Rapid7RateLimitError";
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Client
// ============================================================================

/**
 * HTTP client for the Rapid7 InsightIDR REST API.
 *
 * Handles authentication, pagination, error mapping, and timeout management.
 * All methods return typed responses matching the InsightIDR API documentation.
 */
export class Rapid7Client {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: Rapid7Config) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
  }

  // --------------------------------------------------------------------------
  // Core HTTP
  // --------------------------------------------------------------------------

  private createAbortSignal(): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeoutId),
    };
  }

  /**
   * Send an authenticated request to the InsightIDR API.
   */
  async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: unknown
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const { signal, clear } = this.createAbortSignal();
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
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

    // Handle error responses
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    // 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMsg = `${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMsg = `${errorMsg}: ${errorBody.message}`;
      }
    } catch {
      // ignore JSON parse errors on error responses
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
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    throw new Rapid7ClientError(
      `Request failed: ${errorMsg}`,
      response.status
    );
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>("GET", endpoint, params);
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>("POST", endpoint, params, body);
  }

  async put<T>(
    endpoint: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>("PUT", endpoint, params, body);
  }

  async patch<T>(
    endpoint: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>("PATCH", endpoint, params, body);
  }

  // --------------------------------------------------------------------------
  // Investigation Methods
  // --------------------------------------------------------------------------

  /** List investigations with optional filters */
  async getInvestigations(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<Investigation>> {
    return this.get("/idr/v2/investigations", params);
  }

  /** Get a single investigation by RRN */
  async getInvestigation(
    investigationId: string
  ): Promise<{ data: Investigation }> {
    return this.get(`/idr/v2/investigations/${investigationId}`);
  }

  /** Create a new investigation */
  async createInvestigation(
    body: Record<string, unknown>
  ): Promise<{ data: Investigation }> {
    return this.post("/idr/v2/investigations", body);
  }

  /** Update an existing investigation */
  async updateInvestigation(
    investigationId: string,
    body: Record<string, unknown>
  ): Promise<{ data: Investigation }> {
    return this.patch(`/idr/v2/investigations/${investigationId}`, body);
  }

  /** Add a comment to an investigation */
  async addInvestigationComment(
    investigationId: string,
    body: Record<string, unknown>
  ): Promise<{ data: InvestigationComment }> {
    return this.post(
      `/idr/v2/investigations/${investigationId}/comments`,
      body
    );
  }

  /** Get the timeline of an investigation */
  async getInvestigationTimeline(
    investigationId: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<{ data: InvestigationTimeline[] }> {
    return this.get(
      `/idr/v2/investigations/${investigationId}/timeline`,
      params
    );
  }

  /** Get alerts associated with an investigation */
  async getInvestigationAlerts(
    investigationId: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<Alert>> {
    return this.get(
      `/idr/v2/investigations/${investigationId}/alerts`,
      params
    );
  }

  // --------------------------------------------------------------------------
  // Log Search Methods
  // --------------------------------------------------------------------------

  /** Execute a LEQL query against a log set */
  async searchLogs(
    logSetId: string,
    body: Record<string, unknown>
  ): Promise<LogSearchResponse> {
    return this.post(`/log_search/query/logsets/${logSetId}`, body);
  }

  /** List available log sets */
  async getLogSets(): Promise<{ logsets: LogSet[] }> {
    return this.get("/log_search/management/logsets");
  }

  /** Get a specific log entry */
  async getLogEntry(
    logSetId: string,
    logId: string
  ): Promise<{ data: LogEntry }> {
    return this.get(`/log_search/query/logsets/${logSetId}/entries/${logId}`);
  }

  /** Get aggregate log statistics */
  async getLogStats(
    logSetId: string,
    body: Record<string, unknown>
  ): Promise<{ statistics: LogSearchStats }> {
    return this.post(`/log_search/query/logsets/${logSetId}/stats`, body);
  }

  // --------------------------------------------------------------------------
  // Alert Methods
  // --------------------------------------------------------------------------

  /** List alerts with optional filters */
  async getAlerts(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<Alert>> {
    return this.get("/idr/v2/alerts", params);
  }

  /** Get a single alert by RRN */
  async getAlert(alertId: string): Promise<{ data: Alert }> {
    return this.get(`/idr/v2/alerts/${alertId}`);
  }

  /** Update an alert's status */
  async updateAlertStatus(
    alertId: string,
    body: Record<string, unknown>
  ): Promise<{ data: Alert }> {
    return this.patch(`/idr/v2/alerts/${alertId}`, body);
  }

  /** Get evidence associated with an alert */
  async getAlertEvidence(
    alertId: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<{ data: AlertEvidence }> {
    return this.get(`/idr/v2/alerts/${alertId}/evidence`, params);
  }

  // --------------------------------------------------------------------------
  // Asset Methods
  // --------------------------------------------------------------------------

  /** Search assets with filters */
  async getAssets(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<Asset>> {
    return this.get("/idr/v2/assets", params);
  }

  /** Get a single asset by ID */
  async getAsset(assetId: string): Promise<{ data: Asset }> {
    return this.get(`/idr/v2/assets/${assetId}`);
  }

  /** Get recent activity for an asset */
  async getAssetActivity(
    assetId: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<{ data: AssetActivity[] }> {
    return this.get(`/idr/v2/assets/${assetId}/activity`, params);
  }

  // --------------------------------------------------------------------------
  // User Methods
  // --------------------------------------------------------------------------

  /** Search user accounts */
  async getUsers(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<User>> {
    return this.get("/idr/v2/accounts", params);
  }

  /** Get activity for a specific user */
  async getUserActivity(
    userId: string,
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<{ data: UserActivity[] }> {
    return this.get(`/idr/v2/accounts/${userId}/activity`, params);
  }

  /** Get users with elevated risk scores */
  async getRiskyUsers(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<RiskyUser>> {
    return this.get("/idr/v2/accounts/risky", params);
  }

  // --------------------------------------------------------------------------
  // Threat Methods
  // --------------------------------------------------------------------------

  /** List threat indicators from the threat library */
  async getThreatIndicators(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<ThreatIndicator>> {
    return this.get("/idr/v2/threat_indicators", params);
  }

  /** Add a threat indicator to the library */
  async addThreatIndicator(
    body: Record<string, unknown>
  ): Promise<{ data: ThreatIndicator }> {
    return this.post("/idr/v2/threat_indicators", body);
  }

  /** Search for threat indicator matches in logs */
  async searchThreatActivity(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<ThreatActivity>> {
    return this.get("/idr/v2/threat_indicators/activity", params);
  }

  // --------------------------------------------------------------------------
  // Saved Query Methods
  // --------------------------------------------------------------------------

  /** List saved LEQL queries */
  async getSavedQueries(
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<InsightIDRPaginatedResponse<SavedQuery>> {
    return this.get("/log_search/management/saved_queries", params);
  }

  /** Create a saved LEQL query */
  async createSavedQuery(
    body: Record<string, unknown>
  ): Promise<{ data: SavedQuery }> {
    return this.post("/log_search/management/saved_queries", body);
  }
}
