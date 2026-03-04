# rolli-mcp

MCP server for [Rolli IQ](https://rolli.ai) — social media search and analytics across X, Reddit, Bluesky, YouTube, LinkedIn, Facebook, Instagram, and Weibo.

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

You need a Rolli account with API access. Get your API token and user ID from [rolli.ai](https://rolli.ai).

### Claude Desktop / Claude Code / VS Code / Cursor / Windsurf

Add to your MCP config (`claude_desktop_config.json`, `.vscode/mcp.json`, or equivalent):

```json
{
  "mcpServers": {
    "rolli": {
      "command": "npx",
      "args": ["-y", "@rolli/mcp"],
      "env": {
        "ROLLI_API_TOKEN": "your_token",
        "ROLLI_USER_ID": "your_user_id"
      }
    }
  }
}
```

### Smithery

This server includes a `smithery.yaml` for deployment via [Smithery](https://smithery.ai). It will prompt for your API token and user ID during setup.

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

## License

MIT
