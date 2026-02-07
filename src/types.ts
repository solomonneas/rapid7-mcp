// ============================================================================
// Rapid7 InsightIDR Type Definitions
// ============================================================================

// --- API Response Wrappers ---

/** Standard paginated response from the InsightIDR REST API */
export interface InsightIDRPaginatedResponse<T> {
  data: T[];
  metadata: {
    index: number;
    size: number;
    total_data: number;
    total_pages: number;
  };
}

/** Standard single-object response */
export interface InsightIDRResponse<T> {
  data: T;
}

/** Error response from the API */
export interface InsightIDRError {
  status: number;
  message: string;
  error?: string;
}

// --- Investigations ---

/** Investigation priority levels */
export type InvestigationPriority = "UNSPECIFIED" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Investigation status values */
export type InvestigationStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "WAITING"
  | "CLOSED";

/** Investigation disposition (closure reason) */
export type InvestigationDisposition =
  | "BENIGN"
  | "MALICIOUS"
  | "NOT_APPLICABLE"
  | "UNDECIDED";

/** Timeline entry within an investigation */
export interface InvestigationTimeline {
  sequence_number: number;
  type: string;
  note?: string;
  created_time: string;
  source: string;
}

/** InsightIDR Investigation */
export interface Investigation {
  id: string;
  rrn: string;
  title: string;
  status: InvestigationStatus;
  priority: InvestigationPriority;
  disposition?: InvestigationDisposition;
  assignee?: {
    name: string;
    email: string;
  };
  created_time: string;
  last_accessed: string;
  source: string;
  organization_id: string;
  alerts_most_recent_evidence?: string;
  alerts_most_recent_created_time?: string;
  threat_type?: string;
  responsibility?: string;
  tags?: string[];
}

/** Comment on an investigation */
export interface InvestigationComment {
  id: string;
  body: string;
  created_time: string;
  creator: {
    name: string;
    type: string;
  };
  target: string;
  attachments: string[];
  visibility: string;
}

// --- Log Search ---

/** Log set definition */
export interface LogSet {
  id: string;
  name: string;
  description?: string;
  log_type: string;
  source_type?: string;
  retention_period?: number;
  tokens_seed?: string;
  structures?: string[];
  user_data?: Record<string, unknown>;
}

/** LEQL query result statistics */
export interface LogSearchStats {
  from: number;
  to: number;
  count: number;
  granularity: number;
  timeseries: Record<string, number>;
  groups?: Array<{
    [key: string]: string | number;
  }>;
  stats?: {
    global_timeseries?: Record<string, number>;
    groups?: Array<Record<string, unknown>>;
    count?: number;
    min?: number;
    max?: number;
    avg?: number;
    sum?: number;
  };
}

/** Individual log entry */
export interface LogEntry {
  log_id: string;
  sequence_number?: number;
  timestamp: number;
  message: string;
  labels?: Record<string, string>;
  log_set_id?: string;
  links?: Array<{
    rel: string;
    href: string;
  }>;
}

/** Log search response */
export interface LogSearchResponse {
  events: LogEntry[];
  links?: Array<{
    rel: string;
    href: string;
  }>;
  leql: {
    statement: string;
    during: {
      from: number;
      to: number;
      time_range?: string;
    };
  };
  statistics?: LogSearchStats;
}

// --- Alerts ---

/** Alert severity levels */
export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Alert type classifications */
export type AlertType =
  | "ENDPOINT"
  | "UBA"
  | "NETWORK"
  | "LOG"
  | "CLOUD"
  | "CUSTOM"
  | "HONEYPOT"
  | "DECEPTION";

/** Alert status values */
export type AlertStatus = "OPEN" | "INVESTIGATING" | "CLOSED";

/** Evidence associated with an alert */
export interface AlertEvidence {
  indicators: Array<{
    type: string;
    value: string;
    source: string;
    first_seen?: string;
    last_seen?: string;
  }>;
  events: Array<{
    id: string;
    timestamp: string;
    type: string;
    data: Record<string, unknown>;
  }>;
}

/** InsightIDR Alert */
export interface Alert {
  id: string;
  rrn: string;
  title: string;
  description?: string;
  severity: AlertSeverity;
  type: AlertType;
  status: AlertStatus;
  created_time: string;
  updated_time?: string;
  detection_rule_rrn?: string;
  investigation_rrn?: string;
  assignee?: {
    name: string;
    email: string;
  };
  source?: string;
  rule?: {
    id: string;
    name: string;
    rrn: string;
    mitre_tcodes?: string[];
  };
  organization_id: string;
  first_event_time?: string;
  latest_event_time?: string;
  external_source?: string;
  external_id?: string;
  version?: number;
}

// --- Assets ---

/** Operating system information */
export interface AssetOS {
  name: string;
  version?: string;
  type?: string;
  architecture?: string;
  build?: string;
  family?: string;
}

/** Network interface on an asset */
export interface AssetNetworkInterface {
  name: string;
  ip_addresses: string[];
  mac_address?: string;
}

/** Software installed on an asset */
export interface InstalledSoftware {
  name: string;
  version?: string;
  vendor?: string;
  install_date?: string;
}

/** Vulnerability on an asset */
export interface AssetVulnerability {
  id: string;
  cve?: string;
  title: string;
  severity: string;
  risk_score?: number;
  published_date?: string;
}

/** Agent status on an asset */
export interface AgentStatus {
  id?: string;
  status: string;
  version?: string;
  last_seen?: string;
  platform?: string;
}

/** InsightIDR Asset (endpoint) */
export interface Asset {
  id: string;
  rrn: string;
  hostname: string;
  ip_addresses: string[];
  mac_addresses?: string[];
  os?: AssetOS;
  agent?: AgentStatus;
  domain?: string;
  first_seen: string;
  last_seen: string;
  network_interfaces?: AssetNetworkInterface[];
  installed_software?: InstalledSoftware[];
  vulnerabilities?: AssetVulnerability[];
  tags?: string[];
  organization_id: string;
  hostnames?: string[];
}

/** Activity record for an asset */
export interface AssetActivity {
  timestamp: string;
  type: string;
  description: string;
  user?: string;
  source_ip?: string;
  destination_ip?: string;
  process?: string;
  port?: number;
}

// --- Users ---

/** User risk level */
export type UserRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** User account */
export interface User {
  id: string;
  rrn: string;
  name: string;
  email?: string;
  domain?: string;
  account_name: string;
  disabled: boolean;
  first_seen: string;
  last_seen: string;
  organization_id: string;
  risk_score?: number;
  risk_level?: UserRiskLevel;
  department?: string;
  title?: string;
  location?: string;
  manager?: string;
  groups?: string[];
}

/** User activity entry */
export interface UserActivity {
  timestamp: string;
  type: string;
  description: string;
  asset_name?: string;
  asset_ip?: string;
  source_ip?: string;
  source_location?: {
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  result?: string;
  service?: string;
}

/** Risky user entry with behavior data */
export interface RiskyUser {
  user: User;
  risk_score: number;
  risk_level: UserRiskLevel;
  risk_factors: Array<{
    type: string;
    description: string;
    weight: number;
    first_seen?: string;
    last_seen?: string;
  }>;
  anomalies: Array<{
    type: string;
    description: string;
    timestamp: string;
    severity: string;
  }>;
}

// --- Threats ---

/** Threat indicator type */
export type ThreatIndicatorType =
  | "IP"
  | "DOMAIN"
  | "URL"
  | "HASH_MD5"
  | "HASH_SHA1"
  | "HASH_SHA256"
  | "EMAIL"
  | "PROCESS"
  | "FILENAME";

/** Threat indicator in the threat library */
export interface ThreatIndicator {
  id: string;
  rrn: string;
  type: ThreatIndicatorType;
  value: string;
  source: string;
  description?: string;
  threat_name?: string;
  severity?: string;
  created_time: string;
  updated_time?: string;
  first_seen?: string;
  last_seen?: string;
  tags?: string[];
  confidence?: number;
  organization_id: string;
}

/** Threat activity match (IOC hit in logs) */
export interface ThreatActivity {
  id: string;
  indicator: ThreatIndicator;
  matched_log: {
    log_id: string;
    log_set: string;
    timestamp: string;
    message: string;
  };
  asset?: {
    hostname: string;
    ip: string;
  };
  user?: string;
}

// --- Saved Queries ---

/** Saved LEQL query */
export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  leql: {
    statement: string;
  };
  logs: string[];
  created_time: string;
  updated_time?: string;
  creator?: {
    name: string;
    type: string;
  };
  organization_id: string;
}

// --- Detection Rules ---

/** Detection rule definition */
export interface DetectionRule {
  id: string;
  rrn: string;
  name: string;
  description: string;
  type: string;
  severity: AlertSeverity;
  enabled: boolean;
  mitre_tcodes?: string[];
  created_time: string;
  updated_time?: string;
  version?: number;
}
