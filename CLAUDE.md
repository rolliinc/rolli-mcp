# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP (Model Context Protocol) server for Rolli IQ — exposes social media search and analytics tools (keyword search, user search, topic trees, post retrieval) across X, Reddit, Bluesky, YouTube, LinkedIn, Facebook, Instagram, and Weibo.

## Commands

- **Build:** `npm run build` (runs `tsc`, outputs to `build/`)
- **Test:** `npm test` (runs `vitest run`)
- **Publish:** `npm publish --access public` (publishes to npm under the @rolli org)

## Architecture

TypeScript ESM project using `@modelcontextprotocol/sdk` and `zod`.

- `src/index.ts` — Entry point. Creates `McpServer`, registers all tools, connects via `StdioServerTransport`.
- `src/api.ts` — HTTP client wrapping `fetch` for the Rolli API (`https://rolli.ai/api`). Reads `ROLLI_API_TOKEN` and `ROLLI_USER_ID` from env vars. Exports `apiGet`, `apiPost`, and `apiPut`.
- `src/tools/` — Each file exports a `register(server: McpServer)` function that registers one or more MCP tools:
  - `keyword-search.ts` — `list_keyword_searches`, `keyword_search`, `get_keyword_search`
  - `user-search.ts` — `list_user_searches`, `user_search`, `get_user_search`
  - `topic-tree.ts` — `get_topic_tree`
  - `posts.ts` — `get_keyword_search_posts`, `get_user_search_posts`
  - `integration-setup.ts` — `get_integration_setup`, `update_integration_setup`
  - `usage.ts` — `get_usage`

All tools follow the same pattern: validate params with zod, call the Rolli API via `apiGet`/`apiPost`/`apiPut`, return JSON as text content. Errors are caught and returned with `isError: true`.

The `keyword_search` and `user_search` tools poll the API until the search finishes (or fails/times out after 10 minutes) before returning results.

## Environment Variables

- `ROLLI_API_TOKEN` — Required. Rolli API token.
- `ROLLI_USER_ID` — Required. Rolli user ID.

Both must be set or the server exits on startup.
