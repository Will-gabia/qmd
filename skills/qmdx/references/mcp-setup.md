# QMDx MCP Server Setup

## Install

```bash
npm install -g qmdx
qmdx collection add ~/path/to/markdown --name myknowledge
qmdx embed
```

## Configure MCP Client

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "qmdx": { "command": "qmdx", "args": ["mcp"] }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "qmdx": { "command": "qmdx", "args": ["mcp"] }
  }
}
```

**OpenClaw** (`~/.openclaw/openclaw.json`):
```json
{
  "mcp": {
    "servers": {
      "qmdx": { "command": "qmdx", "args": ["mcp"] }
    }
  }
}
```

## HTTP Mode

```bash
qmdx mcp --http              # Port 8181
qmdx mcp --http --daemon     # Background
qmdx mcp stop                # Stop daemon
```

## Tools

### query

Search with pre-expanded queries.

```json
{
  "searches": [
    { "type": "lex", "query": "keyword phrases" },
    { "type": "vec", "query": "natural language question" },
    { "type": "hyde", "query": "hypothetical answer passage..." }
  ],
  "limit": 10,
  "collection": "optional",
  "minScore": 0.0
}
```

| Type | Method | Input |
|------|--------|-------|
| `lex` | BM25 | Keywords (2-5 terms) |
| `vec` | Vector | Question |
| `hyde` | Vector | Answer passage (50-100 words) |

### get

Retrieve document by path or `#docid`.

| Param | Type | Description |
|-------|------|-------------|
| `path` | string | File path or `#docid` |
| `full` | bool? | Return full content |
| `lineNumbers` | bool? | Add line numbers |

### multi_get

Retrieve multiple documents.

| Param | Type | Description |
|-------|------|-------------|
| `pattern` | string | Glob or comma-separated list |
| `maxBytes` | number? | Skip large files (default 64KB) |

### status

Index health and collections. No params.

## Troubleshooting

- **Not starting**: `which qmdx`, `qmdx mcp` manually
- **No results**: `qmdx collection list`, `qmdx embed`
- **Slow first search**: Normal, models loading (~3GB)
