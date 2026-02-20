# Rapid7 InsightIDR MCP Server

[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![MCP SDK](https://img.shields.io/badge/MCP-1.x-purple)](https://modelcontextprotocol.io)
[![Rapid7](https://img.shields.io/badge/Rapid7-InsightIDR-orange)](https://www.rapid7.com/products/insightidr/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that provides AI assistants with access to [Rapid7 InsightIDR](https://www.rapid7.com/products/insightidr/), a cloud-native SIEM for modern detection and response. Query investigations, search logs with LEQL, analyze alerts, track assets, monitor user behavior, and manage threat intelligence.

## Features

### Investigations
- Search and filter investigations by status, priority, assignee, date range
- Create, update, and manage investigation lifecycle
- Add comments and retrieve associated alerts
- Build investigation timelines

### Log Search (LEQL)
- Execute LEQL (Log Entry Query Language) queries across log sets
- List available log sets (Firewall, DNS, DHCP, Endpoint, Cloud, Active Directory)
- Retrieve individual log entries and aggregate statistics
- LEQL syntax reference and examples

### Alerts
- List and filter alerts by severity, type, status, date
- Get full alert details with evidence and indicators
- Update alert status (open, investigating, closed)
- Evidence extraction for investigation

### Assets
- Search endpoints by hostname, IP, OS, agent status
- Full asset details: software inventory, vulnerabilities, agent info
- Recent activity: logins, processes, network connections

### User Behavior Analytics (UBA)
- Search user accounts across the organization
- Activity analysis: login patterns, locations, accessed assets
- Risky user identification with behavior scoring
- Anomaly detection and alert correlation

### Threat Intelligence
- IOC management: IPs, domains, file hashes
- Add indicators to threat library
- Search for threat indicator matches across logs

### Saved Queries
- List and manage saved LEQL queries
- Create reusable queries with descriptions
- LEQL syntax helper with examples

## Architecture

```
┌────────────────────────────────────────┐
│           MCP Client (LLM)             │
└──────────────┬─────────────────────────┘
               │ MCP Protocol (stdio)
┌──────────────▼─────────────────────────┐
│         rapid7-mcp server              │
│                                        │
│  ┌──────────┐  ┌────────────────────┐  │
│  │ Prompts  │  │    Resources       │  │
│  │ 4 guides │  │ templates, LEQL,   │  │
│  │          │  │ detection rules    │  │
│  └──────────┘  └────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │            Tools                  │  │
│  │  investigations │ logs │ alerts   │  │
│  │  assets │ users │ threats│queries │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│  ┌──────────────▼───────────────────┐  │
│  │      InsightIDR REST Client      │  │
│  │      (client.ts + config.ts)     │  │
│  └──────────────┬───────────────────┘  │
└──────────────────┼─────────────────────┘
                   │ HTTPS
┌──────────────────▼─────────────────────┐
│      Rapid7 InsightIDR Platform API    │
│      https://<region>.api.insight.rapid7│
└────────────────────────────────────────┘
```

## Installation

```bash
git clone https://github.com/solomonneas/rapid7-mcp.git
cd rapid7-mcp
npm install
npm run build
```

## Configuration

Set environment variables:

```bash
export RAPID7_API_KEY="your-api-key"
export RAPID7_REGION="us"          # us, eu, ca, au, ap
export RAPID7_ORG_ID="your-org-id" # optional
```

Or use a `.env` file:

```env
RAPID7_API_KEY=your-api-key
RAPID7_REGION=us
RAPID7_ORG_ID=your-org-id
```

## MCP Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "rapid7": {
      "command": "node",
      "args": ["path/to/rapid7-mcp/dist/index.js"],
      "env": {
        "RAPID7_API_KEY": "your-api-key",
        "RAPID7_REGION": "us"
      }
    }
  }
}
```

## Tool Reference

| Tool | Description |
|------|-------------|
| `search_investigations` | List/filter investigations by status, priority, assignee |
| `get_investigation` | Get full investigation details with timeline |
| `create_investigation` | Create new investigation |
| `update_investigation` | Update status, assignee, disposition |
| `add_investigation_comment` | Add comment/note to investigation |
| `get_investigation_alerts` | Get alerts linked to an investigation |
| `search_logs` | Execute LEQL queries against log sets |
| `list_log_sets` | List available log sets |
| `get_log_entry` | Get specific log entry by ID |
| `get_log_stats` | Aggregate statistics for a time range |
| `list_alerts` | Get alerts with severity/type/status filters |
| `get_alert` | Full alert details with evidence |
| `update_alert_status` | Update alert status |
| `get_alert_evidence` | Get evidence/indicators from an alert |
| `search_assets` | Search endpoints by hostname, IP, OS |
| `get_asset` | Full asset details with software/vulns |
| `get_asset_activity` | Recent activity for an asset |
| `search_users` | Search user accounts |
| `get_user_activity` | User behavior analytics |
| `get_risky_users` | Users with abnormal behavior scores |
| `list_threat_indicators` | List IOCs in threat library |
| `add_threat_indicator` | Add new IOC |
| `search_threat_activity` | Search for IOC matches in logs |
| `list_saved_queries` | List saved LEQL queries |
| `create_saved_query` | Save a LEQL query for reuse |
| `leql_help` | LEQL syntax reference and examples |

## LEQL Query Examples

```sql
-- Find all blocked traffic from a source
where(source_address = 10.0.0.1 AND action = BLOCK)

-- Top talkers by connection count
groupby(source_address) calculate(count) sort(desc)

-- Failed logins for a specific user
where(user = "admin" AND result = FAILED_LOGIN)

-- HTTP errors by URL
where(status >= 400) groupby(url) calculate(count)

-- DNS queries to suspicious domains
where(query CONTAINS "malware") groupby(query) calculate(count)

-- Outbound connections on non-standard ports
where(destination_port != 80 AND destination_port != 443 AND direction = OUTBOUND)
```

## Prompts

| Prompt | Description |
|--------|-------------|
| `investigate-alert` | Guided alert investigation workflow |
| `hunt-ioc` | Search for IOC across all log sources |
| `user-behavior-review` | Analyze user activity for anomalies |
| `incident-timeline` | Build chronological incident timeline |

## Resources

| URI | Description |
|-----|-------------|
| `rapid7://investigation-templates` | Common investigation templates |
| `rapid7://leql-reference` | LEQL syntax and examples |
| `rapid7://detection-rules` | Built-in detection rule catalog |

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm run test     # Run tests
npm run lint     # Lint check
```

## License

MIT
