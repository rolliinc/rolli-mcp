<p align="center">
  <img src="logo.png" alt="Rolli IQ" width="200" />
</p>

<h1 align="center">rolli-mcp</h1>

<p align="center">
  MCP server for <a href="https://rolli.ai">Rolli IQ</a> — social media search and analytics across X, Reddit, Bluesky, YouTube, LinkedIn, Facebook, Instagram, and Weibo.
</p>

<a href="https://glama.ai/mcp/servers/@rolliinc/rolli-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@rolliinc/rolli-mcp/badge" alt="Rolli MCP server" />
</a>

## Tools

| Tool | Description |
|------|-------------|
| `list_keyword_searches` | List all keyword searches, filtered by status |
| `keyword_search` | Create a keyword/hashtag search and return results when complete |
| `get_keyword_search` | Get keyword search results (status, analytics, posts) |
| `list_user_searches` | List all user searches, filtered by status |
| `user_search` | Create a user profile search and return results when complete |
| `get_user_search` | Get user search results (profile, metrics, content analysis) |
| `get_topic_tree` | Get conversation topic tree for a keyword search |
| `get_keyword_search_posts` | Get raw posts from a keyword search |
| `get_user_search_posts` | Get raw posts from a user search |
| `get_integration_setup` | Get current integration settings (webhook URL, name) |
| `update_integration_setup` | Set the webhook URL for search completion notifications |
| `get_usage` | Get API usage data and per-user breakdowns |

## Setup

You need a Rolli account with API access. Get your API token from [rolli.ai](https://rolli.ai).

### Claude Desktop / Claude Code / VS Code / Cursor / Windsurf

Add to your MCP config (`claude_desktop_config.json`, `.vscode/mcp.json`, or equivalent):

```json
{
  "mcpServers": {
    "rolli": {
      "command": "npx",
      "args": ["-y", "@rolli/mcp"],
      "env": {
        "ROLLI_API_TOKEN": "your_token"
      }
    }
  }
}
```

`ROLLI_USER_ID` is optional and defaults to `"rolli-mcp"`. Set it to override with your own user ID.

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ROLLI_USER_ID` | `"rolli-mcp"` | User ID sent with API requests |
| `ROLLI_POLL_INTERVAL_MS` | `5000` | Polling interval (ms) when waiting for search results |
| `ROLLI_MAX_POLL_MS` | `600000` | Max time (ms) to wait before search timeout (default: 10 min) |

### Smithery

This server includes a `smithery.yaml` for deployment via [Smithery](https://smithery.ai). It will prompt for your API token during setup.

## Usage Examples

**Search for a keyword across social media:**
> "Search for posts about 'artificial intelligence' on Twitter and Reddit from the last week"

**Analyze a user profile:**
> "Look up @elonmusk on Twitter and analyze their recent posts"

**Get topic breakdown:**
> "Show me the topic tree for my keyword search #123"

**Check API usage:**
> "How many searches have I used this month?"

**Set up a webhook:**
> "Set my webhook URL to https://myapp.com/rolli-callback"

## Development

```sh
npm ci
npm run lint    # ESLint
npm run build   # TypeScript
npm test        # Vitest
```

CI runs on every push and PR to `master`. Releases published on GitHub automatically publish to npm (requires `NPM_TOKEN` repo secret).

## License

MIT