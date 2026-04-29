# @selfheal/mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for the selfheal compliance cascade. **Wraps GDPR/CCPA right-to-erasure as four MCP tools** so an agent can trigger compliance itself when it detects a deletion intent — no code change required on the agent side.

```bash
pnpm add @selfheal/mcp-server
```

## What it exposes

| Tool | Effect |
|---|---|
| `selfheal_erase_user` | Cascades a deletion across every configured data store and returns the per-adapter result + audit root hash. |
| `selfheal_get_deletion_proof` | Returns the full signed deletion proof (audit chain + signed receipt) for a user. |
| `selfheal_list_pending_requests` | Lists recorded deletion requests, filterable by status. |
| `selfheal_check_compliance_status` | Returns the latest compliance status for a user (`erased: bool`, `compliant: bool`). |

## Run it

The package ships a stdio server CLI:

```bash
SELFHEAL_API_KEY=sk_live_... \
SELFHEAL_PG_URL=postgres://... \
SELFHEAL_PG_RULES='[{"table":"messages","userIdColumn":"user_id"}]' \
SELFHEAL_PINECONE_API_KEY=pk_... \
SELFHEAL_PINECONE_INDEX=agent-memory \
npx selfheal-mcp
```

## Wire into Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "selfheal-compliance": {
      "command": "npx",
      "args": ["-y", "@selfheal/mcp-server"],
      "env": {
        "SELFHEAL_API_KEY": "sk_live_...",
        "SELFHEAL_PG_URL": "postgres://...",
        "SELFHEAL_PG_RULES": "[{\"table\":\"messages\",\"userIdColumn\":\"user_id\"}]",
        "SELFHEAL_PINECONE_API_KEY": "pk_...",
        "SELFHEAL_PINECONE_INDEX": "agent-memory"
      }
    }
  }
}
```

## Use in your own server

```ts
import { buildMcpServer } from "@selfheal/mcp-server";
import { selfheal } from "@selfheal/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const sh = selfheal({ apiKey: process.env.SELFHEAL_API_KEY! });
sh.compliance.configure({ /* ... */ });

const server = buildMcpServer({ client: sh });
await server.connect(new StdioServerTransport());
```

## Optional runtime deps

`pg` and `@pinecone-database/pinecone` are listed as optional peer deps. Install only the ones whose env vars you set; the bin loads them dynamically. If env vars for an adapter aren't set, that adapter is silently skipped.

## License

MIT © Carson Labs
