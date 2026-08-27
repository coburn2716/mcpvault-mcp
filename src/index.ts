#!/usr/bin/env node
/**
 * mcpvault-mcp: Official MCPVault MCP Server
 * Provides search and lookup tools for the MCPVault directory (https://mcpvault.io).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = "https://mcpvault.io/api/servers";
const SUBMIT_URL = "https://mcpvault.io/api/mcp-submit";
const LISTING_BASE = "https://mcpvault.io/servers";

// ── API types ────────────────────────────────────────────────────────────────

interface McpVaultServer {
  slug: string;
  name: string;
  author: string | null;
  description: string | null;
  category: string | null;
  status: "stale" | "claimed" | "verified";
  grade: string | null;
  stars: number | null;
  license: string | null;
  lastUpdated: string | null;
  installCommand: string | null;
  repoUrl: string | null;
  homepageUrl: string | null;
  verifiedAt: string | null;
  clients: string[];
  topics: string[];
  tools: string[];
  logoUrl?: string | null;
  dofollow?: boolean;
}

interface ApiResponse {
  servers: McpVaultServer[];
  total: number;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchServers(params: Record<string, string | number>): Promise<ApiResponse> {
  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "User-Agent": "mcpvault-mcp/0.2.1" },
    });
  } catch (err) {
    throw new McpError(
      ErrorCode.InternalError,
      `Network error reaching MCPVault API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    throw new McpError(
      ErrorCode.InternalError,
      `MCPVault API returned HTTP ${res.status}. Try again shortly.`
    );
  }

  try {
    return (await res.json()) as ApiResponse;
  } catch {
    throw new McpError(ErrorCode.InternalError, "MCPVault API returned an invalid response.");
  }
}

// ── Formatters ───────────────────────────────────────────────────────────────

function gradeLabel(grade: string | null): string {
  if (!grade) return "N/A";
  return grade;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    verified: "Verified",
    claimed: "Claimed",
    stale: "Stale",
  };
  return map[status] ?? status;
}

function formatSearchResult(s: McpVaultServer, index: number): string {
  const lines: string[] = [];
  lines.push(`${index + 1}. ${s.name} (${s.slug})`);
  lines.push(`   Grade: ${gradeLabel(s.grade)}  |  Status: ${statusLabel(s.status)}  |  Stars: ${s.stars ?? "unknown"}`);
  if (s.description) {
    const short = s.description.length > 120 ? s.description.slice(0, 117) + "..." : s.description;
    lines.push(`   ${short}`);
  }
  lines.push(`   Listing: ${LISTING_BASE}/${s.slug}`);
  return lines.join("\n");
}

function formatFullServer(s: McpVaultServer): string {
  const lines: string[] = [];

  lines.push(`Name: ${s.name}`);
  lines.push(`Slug: ${s.slug}`);
  if (s.description) lines.push(`Description: ${s.description}`);
  lines.push(`Grade: ${gradeLabel(s.grade)}`);
  lines.push(`Status: ${statusLabel(s.status)}`);
  if (s.verifiedAt) lines.push(`Verified at: ${s.verifiedAt}`);
  if (s.category) lines.push(`Category: ${s.category}`);
  lines.push(`Stars: ${s.stars ?? "unknown"}`);
  if (s.license && s.license !== "None") lines.push(`License: ${s.license}`);
  if (s.author) lines.push(`Author: ${s.author}`);
  if (s.repoUrl) lines.push(`Repository: ${s.repoUrl}`);
  if (s.homepageUrl) lines.push(`Homepage: ${s.homepageUrl}`);
  if (s.clients && s.clients.length > 0) lines.push(`Client compatibility: ${s.clients.join(", ")}`);
  if (s.topics && s.topics.length > 0) lines.push(`Topics: ${s.topics.join(", ")}`);
  if (s.tools && s.tools.length > 0) lines.push(`Tools: ${s.tools.join(", ")}`);
  if (s.lastUpdated) lines.push(`Last updated: ${s.lastUpdated}`);
  lines.push(`Listing: ${LISTING_BASE}/${s.slug}`);

  return lines.join("\n");
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_mcp_servers",
    description:
      "Search the MCPVault directory for MCP servers. Returns name, grade, status, star count, description, and listing URL for each result.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query, e.g. 'postgres', 'github', 'file system'.",
        },
        category: {
          type: "string",
          description: "Optional category filter, e.g. 'Databases', 'DevTools', 'AI'.",
        },
        status: {
          type: "string",
          enum: ["stale", "claimed", "verified"],
          description: "Optional status filter: verified, claimed, or stale.",
        },
        limit: {
          type: "number",
          description: "Number of results to return (default 10, max 30).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_mcp_server",
    description:
      "Retrieve full details for a specific MCP server by its MCPVault slug. Includes grade, verification status, repo, stars, license, client compatibility, topics, and tool list.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "MCPVault slug, e.g. 'postgres-mcp' or 'github'. Visible in the listing URL: mcpvault.io/servers/<slug>.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_install_command",
    description:
      "Get the install command for a specific MCP server by its MCPVault slug. Returns the command to add it to your AI client, plus the listing URL.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "MCPVault slug for the server.",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "submit_mcp_server",
    description:
      "Submit a GitHub repository to the MCPVault directory as a new MCP server listing. Use this when you find an MCP server on GitHub that is not yet in MCPVault.",
    inputSchema: {
      type: "object",
      properties: {
        repo_url: {
          type: "string",
          description: "Full GitHub repository URL, e.g. https://github.com/owner/repo",
        },
      },
      required: ["repo_url"],
    },
  },
] as const;

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mcpvault-mcp", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── search_mcp_servers ─────────────────────────────────────────────────────
  if (name === "search_mcp_servers") {
    const query = (args?.query as string | undefined) ?? "";
    if (!query.trim()) {
      throw new McpError(ErrorCode.InvalidParams, "query is required and must not be empty.");
    }

    const rawLimit = typeof args?.limit === "number" ? Math.min(Math.max(1, args.limit), 30) : 10;
    const params: Record<string, string | number> = { q: query, limit: rawLimit };
    if (args?.category) params.category = args.category as string;
    if (args?.status) params.status = args.status as string;

    const data = await fetchServers(params);

    if (!data.servers || data.servers.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No MCP servers found for query "${query}". Try a broader search or visit https://mcpvault.io to browse all categories.`,
          },
        ],
      };
    }

    const header = `MCPVault search results for "${query}" (${data.servers.length} of ${data.total} total):\n`;
    const body = data.servers.map((s, i) => formatSearchResult(s, i)).join("\n\n");
    return {
      content: [{ type: "text", text: header + "\n" + body }],
    };
  }

  // ── get_mcp_server ─────────────────────────────────────────────────────────
  if (name === "get_mcp_server") {
    const slug = (args?.slug as string | undefined)?.trim();
    if (!slug) {
      throw new McpError(ErrorCode.InvalidParams, "slug is required.");
    }

    const data = await fetchServers({ slug });

    if (!data.servers || data.servers.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No MCP server found with slug "${slug}". Check the slug or browse https://mcpvault.io to find the correct one.`,
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: formatFullServer(data.servers[0]) }],
    };
  }

  // ── get_install_command ────────────────────────────────────────────────────
  if (name === "get_install_command") {
    const slug = (args?.slug as string | undefined)?.trim();
    if (!slug) {
      throw new McpError(ErrorCode.InvalidParams, "slug is required.");
    }

    const data = await fetchServers({ slug });

    if (!data.servers || data.servers.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No MCP server found with slug "${slug}". Browse https://mcpvault.io to find the correct slug.`,
          },
        ],
      };
    }

    const s = data.servers[0];
    const listing = `${LISTING_BASE}/${s.slug}`;

    if (!s.installCommand) {
      return {
        content: [
          {
            type: "text",
            text: `No install command is recorded for "${s.name}" (${slug}).\n\nVisit the listing page for manual setup instructions: ${listing}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Install command for ${s.name}:\n\n  ${s.installCommand}\n\nListing: ${listing}`,
        },
      ],
    };
  }

  // ── submit_mcp_server ──────────────────────────────────────────────────────
  if (name === "submit_mcp_server") {
    const repoUrl = (args?.repo_url as string | undefined)?.trim();
    if (!repoUrl) {
      throw new McpError(ErrorCode.InvalidParams, "repo_url is required.");
    }

    let res: Response;
    try {
      res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "mcpvault-mcp/0.2.1",
        },
        body: JSON.stringify({ repo_url: repoUrl }),
      });
    } catch (err) {
      throw new McpError(
        ErrorCode.InternalError,
        `Network error reaching MCPVault: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new McpError(ErrorCode.InternalError, `MCPVault returned HTTP ${res.status} with no parseable body.`);
    }

    if (res.status === 201) {
      return {
        content: [
          {
            type: "text",
            text: `Submitted. The server has been added to MCPVault.\nListing: ${data.listing_url}\nThe owner can claim it at https://mcpvault.io/claim.`,
          },
        ],
      };
    }

    if (res.status === 200 && data.reason === "already_listed") {
      return {
        content: [
          {
            type: "text",
            text: `This server is already listed in MCPVault.\nListing: ${data.listing_url}`,
          },
        ],
      };
    }

    if (res.status === 422) {
      return {
        content: [
          {
            type: "text",
            text: `This repository does not appear to be an MCP server. MCPVault requires the repo name, description, or topics to mention "mcp" or "model context protocol". Check the URL and try again.`,
          },
        ],
      };
    }

    if (res.status === 429) {
      return {
        content: [
          {
            type: "text",
            text: `MCPVault submission limit reached for today. Try again tomorrow.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `MCPVault returned an unexpected response (HTTP ${res.status}). Try again shortly or visit https://mcpvault.io.`,
        },
      ],
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running; stdio transport handles the lifecycle.
}

main().catch((err) => {
  process.stderr.write(`mcpvault-mcp fatal error: ${err}\n`);
  process.exit(1);
});
