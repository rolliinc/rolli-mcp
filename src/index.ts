#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { register as registerKeywordSearch } from "./tools/keyword-search.js";
import { register as registerUserSearch } from "./tools/user-search.js";
import { register as registerTopicTree } from "./tools/topic-tree.js";
import { register as registerPosts } from "./tools/posts.js";
import { register as registerIntegrationSetup } from "./tools/integration-setup.js";
import { register as registerUsage } from "./tools/usage.js";
import { register as registerExperts } from "./tools/experts.js";
import { register as registerAgentRuns } from "./tools/agent-runs.js";
import { register as registerAgentSchedules } from "./tools/agent-schedules.js";
import {
  setMaxResponseBytes,
  setPollDefaults,
  setResultsSettleMs,
} from "./tools/_shared.js";

// Non-finite values (unset env vars) are ignored by the setters, leaving the
// shared defaults (5s/10min polling, 100 KB cap, 45s settle window) in place.
setPollDefaults({
  intervalMs: Number(process.env.ROLLI_POLL_INTERVAL_MS),
  maxMs: Number(process.env.ROLLI_MAX_POLL_MS),
});
setMaxResponseBytes(Number(process.env.ROLLI_MAX_RESPONSE_BYTES));
setResultsSettleMs(Number(process.env.ROLLI_RESULTS_SETTLE_MS));

const server = new McpServer({
  name: "rolli-mcp",
  version: "1.4.0",
});

registerKeywordSearch(server);
registerUserSearch(server);
registerTopicTree(server);
registerPosts(server);
registerIntegrationSetup(server);
registerUsage(server);
registerExperts(server);
registerAgentRuns(server);
registerAgentSchedules(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Rolli MCP server running on stdio");
