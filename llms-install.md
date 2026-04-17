# Installing Rolli MCP Server

## Prerequisites

You need a Rolli account with API access. Purchase at [rolli.ai](https://rolli.ai).

Required environment variables:

- `ROLLI_API_TOKEN` — Your Rolli API token

Optional environment variables:

- `ROLLI_USER_ID` — Your Rolli user ID (defaults to `"rolli-mcp"`)

## Installation

Add the following to your MCP client configuration:

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

## Available Tools

- `keyword_search` — Search for keywords/hashtags across social media platforms
- `list_keyword_searches` — List all keyword searches
- `get_keyword_search` — Get keyword search results
- `user_search` — Search for user profiles across social media platforms
- `list_user_searches` — List all user searches
- `get_user_search` — Get user search results
- `get_topic_tree` — Get conversation topic tree for a keyword search
- `get_keyword_search_posts` — Get raw posts from a keyword search
- `get_user_search_posts` — Get raw posts from a user search
- `get_integration_setup` — Get current integration settings
- `update_integration_setup` — Set webhook URL for notifications
- `get_usage` — Get API usage data

## Supported Platforms

X (Twitter), Reddit, YouTube, Facebook, Instagram, Threads, Bluesky, and more.
