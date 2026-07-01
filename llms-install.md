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
- `expert_search` — Find experts matching a natural-language query
- `list_expert_searches` — List all expert searches
- `get_expert_search` — Get expert search results (recommended experts with AI-generated match summaries)
- `get_topic_tree` — Get conversation topic tree for a keyword search
- `get_keyword_search_posts` — Get raw posts from a keyword search
- `get_user_search_posts` — Get raw posts from a user search
- `start_agent_run` — Start a Rolli Agent investigation and return the markdown report when complete
- `list_agent_runs` — List Rolli Agent runs
- `get_agent_run` — Get a Rolli Agent run (progress or full report)
- `cancel_agent_run` — Cancel a pending or running Rolli Agent run
- `rerun_agent_run` — Retry a failed Rolli Agent run
- `update_agent_run` — Pin or rename a Rolli Agent run
- `delete_agent_run` — Soft-delete a Rolli Agent run
- `create_agent_schedule` — Create a recurring Rolli Agent report (daily/weekly/monthly/once)
- `list_agent_schedules` — List Rolli Agent scheduled reports
- `get_agent_schedule` — Get a Rolli Agent schedule with recent runs
- `update_agent_schedule` — Update a Rolli Agent schedule
- `delete_agent_schedule` — Permanently delete a Rolli Agent schedule
- `pause_agent_schedule` — Pause a Rolli Agent schedule
- `resume_agent_schedule` — Resume a paused Rolli Agent schedule
- `list_agent_schedule_runs` — List execution history for a Rolli Agent schedule
- `get_integration_setup` — Get current integration settings
- `update_integration_setup` — Set webhook URL for notifications
- `get_usage` — Get API usage data

## Supported Platforms

X (Twitter), Reddit, YouTube, Facebook, Instagram, Threads, Bluesky, and more.

## Optional X/Twitter Source Context

When a workflow needs reviewed account-scoped X/Twitter evidence before a Rolli
search or agent report, collect that evidence with an approved OpenClaw workflow
such as [TweetClaw](https://github.com/Xquik-dev/tweetclaw). Pass Rolli only
reviewed handles, post URLs, post IDs, excerpts, or summary notes. Do not pass
API tokens, cookies, sessions, or account credentials between tools.
