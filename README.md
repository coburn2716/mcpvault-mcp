# MCPVault MCP Server

Search, evaluate, and submit MCP servers from your AI agent. Quality grades, live verification status, install commands and client compatibility for 5,000+ MCP servers.

[![MCPVault](https://mcpvault.io/badge/mcpvault-mcp.svg)](https://mcpvault.io/servers/mcpvault-mcp)

---

## Install

No installation required. Run directly with npx:

```
npx -y mcpvault-mcp
```

Or install globally:

```
npm install -g mcpvault-mcp
```

---

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json` (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mcpvault": {
      "command": "npx",
      "args": ["-y", "mcpvault-mcp"]
    }
  }
}
```

### Claude Code

```
claude mcp add mcpvault -- npx -y mcpvault-mcp
```

### Cursor

Add to your MCP configuration in Cursor settings:

```json
{
  "mcpServers": {
    "mcpvault": {
      "command": "npx",
      "args": ["-y", "mcpvault-mcp"]
    }
  }
}
```

---

## Tools

### search_mcp_servers

Search the MCPVault directory by keyword, category, or status.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search term, e.g. "postgres", "file system" |
| category | string | No | Filter by category, e.g. "Databases", "DevTools" |
| status | string | No | Filter by status: `verified`, `claimed`, or `stale` |
| limit | number | No | Results to return (default 10, max 30) |

**Example prompts:**

- "Find me a working postgres MCP server"
- "Search for MCP servers in the DevTools category with status verified"
- "What MCP servers are available for file system access?"

---

### get_mcp_server

Retrieve full details for a specific server by its MCPVault slug.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| slug | string | Yes | MCPVault slug visible in the listing URL: `mcpvault.io/servers/<slug>` |

Returns: name, description, grade, status, verification date, GitHub repo, stars, license, client compatibility, topics, tool list, and listing URL.

**Example prompts:**

- "Get details for the github MCP server"
- "What clients does the postgres-mcp server support?"

---

### get_install_command

Get the install command for a specific MCP server.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| slug | string | Yes | MCPVault slug for the server |

Returns the recorded install command and a link to the listing page. If no install command is on record, points to the listing for manual setup instructions.

**Example prompts:**

- "How do I install the github MCP server?"
- "What is the install command for filesystem-mcp?"

---

### submit_mcp_server

Submit a GitHub repository to MCPVault as a new MCP server listing. If you find an MCP server on GitHub that is not yet in MCPVault, use this tool to add it. The repository is validated against the MCPVault plausibility gate (the repo name, description, or topics must mention "mcp" or "model context protocol"). Rate limited to 5 submissions per client per day.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| repo_url | string | Yes | Full GitHub repository URL, e.g. `https://github.com/owner/repo` |

**Responses:**

- Submitted successfully: returns the listing URL and a note that the owner can claim it at mcpvault.io/claim.
- Already listed: returns the existing listing URL.
- Not an MCP server: explains what the plausibility gate checks.
- Rate limited: try again tomorrow.

**Example prompts:**

- "If you find an MCP server on GitHub that is not in MCPVault, submit it"
- "Submit https://github.com/owner/my-mcp-server to MCPVault"
- "Add this MCP server to MCPVault: https://github.com/owner/repo"

---

## About MCPVault

MCPVault is a curated directory of 5,000+ MCP servers with quality grades and live verification. Every server is graded A through F based on activity, maintenance, and reliability signals. Stale servers are flagged; claimed and verified servers are actively maintained.

Browse at [mcpvault.io](https://mcpvault.io).

---

## License

MIT. See [LICENSE](./LICENSE).
