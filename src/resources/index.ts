import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register MCP resources that expose static reference data
 * for InsightIDR workflows.
 */
export function registerResources(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Investigation Templates
  // -------------------------------------------------------------------------
  server.resource(
    "investigation-templates",
    "rapid7://investigation-templates",
    {
      description:
        "Common investigation templates for InsightIDR incidents including phishing, malware, lateral movement, and data exfiltration workflows",
      mimeType: "application/json",
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
            "Notify affected users and reset credentials if needed",
          ],
          log_sets: ["Email Activity", "Web Proxy", "Endpoint Agent", "Authentication"],
          leql_queries: [
            'where(sender_domain = "malicious-domain.com")',
            'where(url CONTAINS "phishing-url")',
            'where(file_hash = "MALWARE_HASH")',
          ],
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
            "Update detection rules for the malware family",
          ],
          log_sets: ["Endpoint Agent", "Firewall", "DNS", "Web Proxy"],
          leql_queries: [
            'where(file_hash = "SAMPLE_HASH") groupby(hostname) calculate(count)',
            "where(source_address = INFECTED_IP AND destination_port NOT IN [80, 443])",
            'where(process_name = "suspicious.exe")',
          ],
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
            "Force password resets for compromised accounts",
          ],
          log_sets: ["Active Directory", "Authentication", "Endpoint Agent", "Firewall"],
          leql_queries: [
            "where(event_type = AUTHENTICATION AND result = SUCCESS) groupby(source_address, destination_address) calculate(count)",
            "where(destination_port IN [3389, 445, 5985, 5986]) groupby(source_address) calculate(count)",
            'where(process_name IN ["psexec.exe", "wmic.exe", "powershell.exe"])',
          ],
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
            "Implement DLP rules to prevent recurrence",
          ],
          log_sets: ["Firewall", "Web Proxy", "DNS", "Cloud Services", "Endpoint Agent"],
          leql_queries: [
            "where(bytes_sent > 100000000) groupby(source_address, destination_address) calculate(sum:bytes_sent) sort(-sum)",
            "where(destination_port NOT IN [80, 443] AND bytes_sent > 1000000)",
            "where(query_type = TXT) groupby(query) calculate(count) sort(-count)",
          ],
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
            "Enable MFA if not already in place",
          ],
          log_sets: ["Authentication", "Active Directory", "VPN", "Web Application"],
          leql_queries: [
            "where(result = FAILED_LOGIN) groupby(user) calculate(count) sort(-count)",
            "where(result = FAILED_LOGIN) groupby(source_address) calculate(count) sort(-count)",
            "where(result = FAILED_LOGIN) groupby(source_address, user) calculate(count)",
          ],
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
            "Engage HR and legal if warranted",
          ],
          log_sets: ["Authentication", "Endpoint Agent", "Cloud Services", "Email Activity"],
          leql_queries: [
            'where(user = "TARGET_USER") groupby(type) calculate(count)',
            'where(user = "TARGET_USER" AND hour >= 22 OR hour <= 5)',
            'where(user = "TARGET_USER" AND bytes_sent > 10000000)',
          ],
        },
      ];

      return {
        contents: [
          {
            uri: "rapid7://investigation-templates",
            mimeType: "application/json",
            text: JSON.stringify({ templates, total: templates.length }, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // LEQL Reference
  // -------------------------------------------------------------------------
  server.resource(
    "leql-reference",
    "rapid7://leql-reference",
    {
      description:
        "LEQL (Log Entry Query Language) syntax reference with operators, functions, and common query patterns",
      mimeType: "application/json",
    },
    async () => {
      const reference = {
        overview:
          "LEQL (Log Entry Query Language) is the query language for searching log data in Rapid7 InsightIDR. " +
          "Queries consist of clauses: where → groupby → calculate → sort → limit.",
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
              { op: "!=~", description: "Negated regex match" },
            ],
            logical: ["AND", "OR", "NOT"],
          },
          groupby: {
            description: "Group results by one or more fields",
            syntax: "groupby(field1, field2, ...)",
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
              { fn: "bytes", description: "Format byte values" },
            ],
          },
          sort: {
            description: "Order results by a field",
            syntax: "sort(field) or sort(-field) for descending",
          },
          limit: {
            description: "Limit the number of results",
            syntax: "limit(N)",
          },
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
          "Last 90 Days",
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
            "bytes_received",
          ],
          authentication: [
            "user",
            "result",
            "source_address",
            "destination_address",
            "service",
            "authentication_type",
          ],
          dns: [
            "query",
            "query_type",
            "response_code",
            "source_address",
            "destination_address",
          ],
          http: [
            "url",
            "method",
            "status",
            "user_agent",
            "source_address",
            "host",
            "content_type",
          ],
          endpoint: [
            "process_name",
            "parent_process",
            "command_line",
            "file_path",
            "file_hash",
            "user",
            "hostname",
          ],
        },
      };

      return {
        contents: [
          {
            uri: "rapid7://leql-reference",
            mimeType: "application/json",
            text: JSON.stringify(reference, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Detection Rules
  // -------------------------------------------------------------------------
  server.resource(
    "detection-rules",
    "rapid7://detection-rules",
    {
      description:
        "Built-in InsightIDR detection rule descriptions organized by attack category",
      mimeType: "application/json",
    },
    async () => {
      const detectionRules = {
        categories: [
          {
            name: "Attacker Behavior Analytics (ABA)",
            description:
              "Detects known attacker tools, techniques, and procedures based on network and endpoint data",
            rules: [
              {
                name: "ABA - Mimikatz Usage Detected",
                severity: "CRITICAL",
                mitre: ["T1003", "T1098"],
                description:
                  "Detects execution or presence of Mimikatz credential dumping tool",
              },
              {
                name: "ABA - Cobalt Strike Beacon Communication",
                severity: "CRITICAL",
                mitre: ["T1071", "T1573"],
                description:
                  "Identifies network traffic patterns consistent with Cobalt Strike beacon C2",
              },
              {
                name: "ABA - PowerShell Encoded Command Execution",
                severity: "HIGH",
                mitre: ["T1059.001", "T1027"],
                description:
                  "Detects PowerShell execution with Base64 encoded commands",
              },
              {
                name: "ABA - Suspicious Scheduled Task Creation",
                severity: "MEDIUM",
                mitre: ["T1053.005"],
                description:
                  "Detects creation of scheduled tasks commonly used for persistence",
              },
            ],
          },
          {
            name: "User Behavior Analytics (UBA)",
            description:
              "Detects anomalous user behavior through machine learning baselines",
            rules: [
              {
                name: "UBA - Anomalous Login Location",
                severity: "HIGH",
                mitre: ["T1078"],
                description:
                  "User authenticated from a geographic location never seen before",
              },
              {
                name: "UBA - Impossible Travel",
                severity: "HIGH",
                mitre: ["T1078"],
                description:
                  "User authenticated from two locations in a timeframe that would require impossible travel speed",
              },
              {
                name: "UBA - First Access to Critical Asset",
                severity: "MEDIUM",
                mitre: ["T1078"],
                description:
                  "User accessed a critical server or service for the first time",
              },
              {
                name: "UBA - Abnormal Authentication Volume",
                severity: "MEDIUM",
                mitre: ["T1110"],
                description:
                  "User generated an unusually high number of authentication events",
              },
            ],
          },
          {
            name: "Endpoint Detection",
            description:
              "Detects suspicious activity on endpoints monitored by the Insight Agent",
            rules: [
              {
                name: "EDR - Suspicious Process Injection",
                severity: "CRITICAL",
                mitre: ["T1055"],
                description:
                  "Detected process injection techniques (DLL injection, process hollowing)",
              },
              {
                name: "EDR - Credential Dumping via LSASS",
                severity: "CRITICAL",
                mitre: ["T1003.001"],
                description:
                  "Process accessed LSASS memory, indicating credential dumping attempt",
              },
              {
                name: "EDR - Ransomware File Encryption",
                severity: "CRITICAL",
                mitre: ["T1486"],
                description:
                  "Mass file encryption activity detected consistent with ransomware behavior",
              },
              {
                name: "EDR - Living Off the Land Binary Usage",
                severity: "HIGH",
                mitre: ["T1218"],
                description:
                  "Suspicious use of LOLBins (certutil, mshta, regsvr32) for malicious purposes",
              },
            ],
          },
          {
            name: "Network Detection",
            description:
              "Detects suspicious network traffic patterns and protocols",
            rules: [
              {
                name: "NET - DNS Tunneling Detected",
                severity: "HIGH",
                mitre: ["T1071.004"],
                description:
                  "Unusually long or high-volume DNS queries suggesting DNS tunneling",
              },
              {
                name: "NET - Beaconing Activity",
                severity: "HIGH",
                mitre: ["T1071"],
                description:
                  "Regular periodic outbound connections consistent with C2 beaconing",
              },
              {
                name: "NET - Large Data Transfer to External Host",
                severity: "MEDIUM",
                mitre: ["T1048"],
                description:
                  "Unusually large volume of data transferred to an external destination",
              },
              {
                name: "NET - Connection to Known Malicious IP",
                severity: "HIGH",
                mitre: ["T1071"],
                description:
                  "Network connection established to an IP address in threat intelligence feeds",
              },
            ],
          },
          {
            name: "Cloud Detection",
            description:
              "Detects suspicious activity in cloud services (AWS, Azure, GCP, O365)",
            rules: [
              {
                name: "CLOUD - Unusual API Call Volume",
                severity: "MEDIUM",
                mitre: ["T1078.004"],
                description:
                  "Cloud account generated an unusually high number of API calls",
              },
              {
                name: "CLOUD - S3 Bucket Policy Change",
                severity: "HIGH",
                mitre: ["T1537"],
                description:
                  "S3 bucket policy was modified to allow public access",
              },
              {
                name: "CLOUD - New Region Activity",
                severity: "MEDIUM",
                mitre: ["T1078.004"],
                description:
                  "Cloud resources created in a region not previously used",
              },
              {
                name: "CLOUD - MFA Disabled for User",
                severity: "HIGH",
                mitre: ["T1556"],
                description:
                  "Multi-factor authentication was disabled for a user account",
              },
            ],
          },
        ],
      };

      return {
        contents: [
          {
            uri: "rapid7://detection-rules",
            mimeType: "application/json",
            text: JSON.stringify(detectionRules, null, 2),
          },
        ],
      };
    }
  );
}
