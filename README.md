<p align="center">
  <img src="logo.png" alt="Rolli IQ" width="200" />
</p>

<h1 align="center">rolli-mcp</h1>

<p align="center">
  MCP server for <a href="https://rolli.ai">Rolli IQ</a> — social media search and analytics across X, Reddit, YouTube, Facebook, Instagram, Threads, Bluesky, and more.
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
| `list_expert_searches` | List all expert searches, filtered by status |
| `expert_search` | Find experts matching a natural-language query and return results when complete |
| `get_expert_search` | Get expert search results (recommended experts with AI-generated match summaries) |
| `get_topic_tree` | Get conversation topic tree for a keyword search |
| `get_keyword_search_posts` | Get raw posts from a keyword search |
| `get_user_search_posts` | Get raw posts from a user search |
| `list_agent_runs` | List Rolli Agent runs (AI-driven social intelligence investigations) |
| `start_agent_run` | Start a Rolli Agent investigation and return the markdown report when complete |
| `get_agent_run` | Get a Rolli Agent run by ID (progress while running, full report when complete) |
| `cancel_agent_run` | Cancel a pending or running Rolli Agent run |
| `rerun_agent_run` | Retry a failed, waiting, or stuck Rolli Agent run |
| `update_agent_run` | Pin or rename a Rolli Agent run |
| `delete_agent_run` | Soft-delete a completed or failed Rolli Agent run |
| `list_agent_schedules` | List Rolli Agent scheduled reports |
| `create_agent_schedule` | Create a recurring Rolli Agent report (daily/weekly/monthly/once) |
| `get_agent_schedule` | Get a Rolli Agent schedule with its 10 most recent runs |
| `update_agent_schedule` | Update a Rolli Agent schedule |
| `delete_agent_schedule` | Permanently delete a Rolli Agent schedule |
| `pause_agent_schedule` | Pause a Rolli Agent schedule |
| `resume_agent_schedule` | Resume a paused Rolli Agent schedule |
| `list_agent_schedule_runs` | List the full execution history of a Rolli Agent schedule |
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

## Optional X/Twitter Source Context

Rolli is useful for cross-platform social search, topic trees, user analysis,
and scheduled social intelligence reports. If an agent also needs reviewed
account-scoped X/Twitter source evidence before a Rolli investigation, collect
that evidence in an approved OpenClaw workflow such as
[TweetClaw](https://github.com/Xquik-dev/tweetclaw), then pass only the
reviewed handles, post URLs, post IDs, excerpts, or summary notes into Rolli
prompts.

Keep Rolli and TweetClaw credentials separate. Do not transfer API tokens,
cookies, sessions, or account credentials between tools. Treat TweetClaw output
as source context for Rolli searches and reports, not as publishing approval.

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
