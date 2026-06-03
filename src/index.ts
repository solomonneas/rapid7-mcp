import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config.js";
import { Rapid7Client } from "./client.js";
import { registerInvestigationTools } from "./tools/investigations.js";
import { registerLogTools } from "./tools/logs.js";
import { registerAlertTools } from "./tools/alerts.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerUserTools } from "./tools/users.js";
import { registerThreatTools } from "./tools/threats.js";
import { registerQueryTools } from "./tools/queries.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

async function main(): Promise<void> {
  const config = getConfig();
  const client = new Rapid7Client(config);

  const server = new McpServer({
    name: "rapid7-mcp",
    version: "1.0.0",
    description:
      "MCP server for Rapid7 InsightIDR — investigate alerts, search logs with LEQL, " +
      "manage investigations, track assets and users, and query threat intelligence",
  });

  // Register all tool groups
  registerInvestigationTools(server, client);
  registerLogTools(server, client);
  registerAlertTools(server, client);
  registerAssetTools(server, client);
  registerUserTools(server, client);
  registerThreatTools(server, client);
  registerQueryTools(server, client);

  // Register resources and prompts
  registerResources(server);
  registerPrompts(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  // Strip the draft-07 `$schema` the MCP SDK stamps on tool schemas; Anthropic
  // rejects it ("must match JSON Schema draft 2020-12") when the full tool set
  // is sent, e.g. on subagent spawns. Intercept tools/list output here.
  const __send = transport.send.bind(transport);
  (transport as any).send = (message: any) => {
    const tools = message?.result?.tools;
    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (t?.inputSchema) delete t.inputSchema.$schema;
        if (t?.outputSchema) delete t.outputSchema.$schema;
      }
    }
    return __send(message);
  };
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
