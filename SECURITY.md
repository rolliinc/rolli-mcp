# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub Security Advisories](https://github.com/rolliinc/rolli-mcp/security/advisories/new) to report vulnerabilities privately.

We will acknowledge your report within 48 hours and aim to provide a fix within 7 days for critical issues.

## Security Considerations

This package is an MCP (Model Context Protocol) server that uses the following environment variables:

- `ROLLI_API_TOKEN` — Required. Your Rolli API authentication token.
- `ROLLI_USER_ID` — Optional. Your Rolli user ID (defaults to `"rolli-mcp"`).

These credentials are read from environment variables at startup and are never logged, stored on disk, or transmitted to any endpoint other than the official Rolli API (`https://rolli.ai/api`).
