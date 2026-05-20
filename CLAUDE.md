# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP (Model Context Protocol) server for Rolli IQ — exposes social media search and analytics tools (keyword search, user search, topic trees, post retrieval) across X, Reddit, YouTube, Facebook, Instagram, Threads, Bluesky, and more.

## Commands

- **Build:** `npm run build` (runs `tsc`, outputs to `build/`)
- **Lint:** `npm run lint` (runs `eslint src/`)
- **Test:** `npm test` (runs `vitest run`)
- **Publish:** `npm publish --access public` (publishes to npm under the @rolli org)

## Architecture

TypeScript ESM project using `@modelcontextprotocol/sdk` and `zod`.

- `src/index.ts` — Entry point. Creates `McpServer`, registers all tools, connects via `StdioServerTransport`.
- `src/api.ts` — HTTP client wrapping `fetch` for the Rolli APIs. Reads `ROLLI_API_TOKEN` and `ROLLI_USER_ID` from env vars. Exports `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` (base `https://rolli.ai/api`) and `agentGet`/`agentPost`/`agentPatch`/`agentDelete` (base `https://agent.rolli.ai`, overridable via `ROLLI_AGENT_BASE_URL`).
- `src/tools/` — Each file exports a `register(server: McpServer)` function that registers one or more MCP tools:
  - `keyword-search.ts` — `list_keyword_searches`, `keyword_search`, `get_keyword_search`
  - `user-search.ts` — `list_user_searches`, `user_search`, `get_user_search`
  - `experts.ts` — `list_expert_searches`, `expert_search`, `get_expert_search`
  - `topic-tree.ts` — `get_topic_tree`
  - `posts.ts` — `get_keyword_search_posts`, `get_user_search_posts`
  - `agent-runs.ts` — `list_agent_runs`, `start_agent_run`, `get_agent_run`, `cancel_agent_run`, `rerun_agent_run`, `update_agent_run`, `delete_agent_run`
  - `agent-schedules.ts` — `list_agent_schedules`, `create_agent_schedule`, `get_agent_schedule`, `update_agent_schedule`, `delete_agent_schedule`, `pause_agent_schedule`, `resume_agent_schedule`, `list_agent_schedule_runs`
  - `integration-setup.ts` — `get_integration_setup`, `update_integration_setup`
  - `usage.ts` — `get_usage`

All tools follow the same pattern: validate params with zod, call the Rolli API via `apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete` (or the `agent*` equivalents for Rolli Agent endpoints), return JSON as text content. Errors are caught and returned with `isError: true`.

The `keyword_search`, `user_search`, `expert_search`, and `start_agent_run` tools poll the API until the operation finishes (or fails/times out after 10 minutes) before returning results.

## Environment Variables

- `ROLLI_API_TOKEN` — Required. Rolli API token.
- `ROLLI_USER_ID` — Optional. Rolli user ID. Defaults to `"rolli-mcp"` if not set.
- `ROLLI_POLL_INTERVAL_MS` — Optional. Polling interval in ms for search completion. Defaults to `5000`.
- `ROLLI_MAX_POLL_MS` — Optional. Max polling duration in ms before timeout. Defaults to `600000` (10 minutes).
