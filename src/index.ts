#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { register as registerKeywordSearch } from "./tools/keyword-search.js";
import { register as registerUserSearch } from "./tools/user-search.js";
import { register as registerTopicTree } from "./tools/topic-tree.js";
import { register as registerPosts } from "./tools/posts.js";
import { register as registerIntegrationSetup } from "./tools/integration-setup.js";
import { register as registerUsage } from "./tools/usage.js";

const server = new McpServer({
  name: "rolli-mcp",
  version: "1.0.0",
});

registerKeywordSearch(server);
registerUserSearch(server);
registerTopicTree(server);
registerPosts(server);
registerIntegrationSetup(server);
registerUsage(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Rolli MCP server running on stdio");
