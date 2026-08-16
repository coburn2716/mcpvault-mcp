#!/usr/bin/env node
/**
 * Smoke test for mcpvault-mcp.
 * Spawns the built server, performs a stdio MCP handshake, lists tools,
 * and calls search_mcp_servers with query "postgres".
 *
 * Usage: node scripts/smoke-test.mjs
 * (run `npm run build` first)
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverBin = path.join(__dirname, "..", "dist", "index.js");

const TIMEOUT_MS = 15_000;

function startServer() {
  return spawn("node", [serverBin], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function send(child, msg) {
  const line = JSON.stringify(msg) + "\n";
  child.stdin.write(line);
}

async function runSmoke() {
  const child = startServer();

  let stderrOutput = "";
  child.stderr.on("data", (d) => {
    stderrOutput += d.toString();
  });

  const rl = createInterface({ input: child.stdout });
  const lines = [];
  const lineQueue = [];
  let waitResolve = null;

  rl.on("line", (line) => {
    if (line.trim()) {
      if (waitResolve) {
        const resolve = waitResolve;
        waitResolve = null;
        resolve(line);
      } else {
        lineQueue.push(line);
      }
    }
  });

  function nextLine() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for server response"));
      }, TIMEOUT_MS);

      if (lineQueue.length > 0) {
        clearTimeout(timer);
        resolve(lineQueue.shift());
        return;
      }

      waitResolve = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
    });
  }

  try {
    // ── Step 1: initialize ──────────────────────────────────────────────────
    console.log("[smoke] Sending initialize...");
    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "1.0.0" },
      },
    });

    const initLine = await nextLine();
    const initMsg = JSON.parse(initLine);
    if (initMsg.error) throw new Error(`initialize failed: ${initMsg.error.message}`);

    console.log("[smoke] initialize OK");
    console.log("        serverInfo:", JSON.stringify(initMsg.result?.serverInfo));
    console.log("        protocolVersion:", initMsg.result?.protocolVersion);

    // ── Step 2: notifications/initialized ──────────────────────────────────
    send(child, { jsonrpc: "2.0", method: "notifications/initialized" });

    // ── Step 3: tools/list ─────────────────────────────────────────────────
    console.log("\n[smoke] Sending tools/list...");
    send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

    const toolsLine = await nextLine();
    const toolsMsg = JSON.parse(toolsLine);
    if (toolsMsg.error) throw new Error(`tools/list failed: ${toolsMsg.error.message}`);

    const tools = toolsMsg.result?.tools ?? [];
    console.log(`[smoke] tools/list OK: ${tools.length} tools`);
    for (const t of tools) {
      console.log(`        - ${t.name}`);
    }

    if (tools.length !== 4) {
      throw new Error(`Expected 4 tools, got ${tools.length}`);
    }
    const toolNames = tools.map((t) => t.name);
    for (const expected of ["search_mcp_servers", "get_mcp_server", "get_install_command", "submit_mcp_server"]) {
      if (!toolNames.includes(expected)) throw new Error(`Missing tool: ${expected}`);
    }

    // ── Step 4: tools/call search_mcp_servers ──────────────────────────────
    console.log('\n[smoke] Calling search_mcp_servers with query "postgres"...');
    send(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "search_mcp_servers",
        arguments: { query: "postgres", limit: 3 },
      },
    });

    const searchLine = await nextLine();
    const searchMsg = JSON.parse(searchLine);
    if (searchMsg.error) throw new Error(`search failed: ${searchMsg.error.message}`);

    const content = searchMsg.result?.content ?? [];
    const text = content.map((c) => c.text).join("");

    if (!text.includes("mcpvault.io/servers/")) {
      throw new Error("Search result does not contain a MCPVault listing URL");
    }
    if (!text.includes("Grade:")) {
      throw new Error("Search result does not contain grade info");
    }

    console.log("[smoke] search_mcp_servers OK. Sample output:");
    console.log("---");
    console.log(text.split("\n").slice(0, 12).join("\n"));
    console.log("---");

    // ── Step 5: tools/call get_install_command ─────────────────────────────
    // Extract first slug from the search results
    const slugMatch = text.match(/mcpvault\.io\/servers\/([^\s\n]+)/);
    const firstSlug = slugMatch ? slugMatch[1] : null;

    if (firstSlug) {
      console.log(`\n[smoke] Calling get_install_command for slug "${firstSlug}"...`);
      send(child, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "get_install_command",
          arguments: { slug: firstSlug },
        },
      });

      const installLine = await nextLine();
      const installMsg = JSON.parse(installLine);
      if (installMsg.error) throw new Error(`get_install_command failed: ${installMsg.error.message}`);

      const installText = (installMsg.result?.content ?? []).map((c) => c.text).join("");
      console.log("[smoke] get_install_command OK. Output:");
      console.log("---");
      console.log(installText.slice(0, 300));
      console.log("---");
    }

    console.log("\n[smoke] ALL CHECKS PASSED");
  } catch (err) {
    console.error("\n[smoke] FAILED:", err.message);
    if (stderrOutput) console.error("[smoke] stderr:", stderrOutput.slice(-500));
    process.exitCode = 1;
  } finally {
    child.stdin.end();
    child.kill();
  }
}

runSmoke();
