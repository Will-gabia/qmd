# QMDx - Query Markdown Documents

**항상 한국어로 답변하세요.** 사용자가 다른 언어를 명시하지 않는 한 모든 응답은 한국어로 작성합니다. 코드 블록·명령어·식별자는 원문 그대로 두되, 설명과 요약은 한국어로 작성합니다. 이 규칙을 절대 잊지 마세요.

Use Bun instead of Node.js (`bun` not `node`, `bun install` not `npm install`).

## Commands

```sh
qmdx collection add . --name <n>   # Create/index collection
qmdx collection list               # List all collections with details
qmdx collection remove <name>      # Remove a collection by name
qmdx collection rename <old> <new> # Rename a collection
qmdx init                          # Create a project-local .qmdx index
qmdx init --index-dir <dir>        # Create an isolated index in <dir> (multi-project)
qmdx ls [collection[/path]]        # List collections or files in a collection
qmdx context add [path] "text"     # Add context for path (defaults to current dir)
qmdx context list                  # List all contexts
qmdx context check                 # Check for collections/paths missing context
qmdx context rm <path>             # Remove context
qmdx get <file>[:from[:count]]     # Get by path or docid (#abc123); optional line range
qmdx multi-get <pattern>           # Get multiple docs by glob or comma-separated list
qmdx status                        # Show index status and collections
qmdx doctor                        # Diagnose config, index, model, and device issues
qmdx update                        # Re-index collections; configured update hooks run first
qmdx embed                         # Generate vector embeddings (uses node-llama-cpp)
qmdx query <query>                 # Search with query expansion + reranking (recommended)
qmdx search <query>                # Full-text keyword search (BM25, no LLM)
qmdx vsearch <query>               # Vector similarity search (no reranking)
qmdx bench <fixture.json>          # Run search-quality benchmarks
qmdx mcp                           # Start MCP server (stdio transport)
qmdx mcp --http [--port N]         # Start MCP server (HTTP, default port 8181)
qmdx mcp --http --daemon           # Start as background daemon
qmdx mcp stop                      # Stop background MCP daemon
```

## Collection Management

```sh
# List all collections
qmdx collection list

# Create a collection with explicit name
qmdx collection add ~/Documents/notes --name mynotes --mask '**/*.md'

# Remove a collection
qmdx collection remove mynotes

# Rename a collection
qmdx collection rename mynotes my-notes

# Show collection details
qmdx collection show mynotes

# Set or clear the pre-update hook (runs before re-indexing on `qmdx update`)
qmdx collection update-cmd mynotes 'git pull --ff-only'
qmdx collection update-cmd mynotes            # clear

# Include or exclude from default (unscoped) queries
qmdx collection exclude mynotes
qmdx collection include mynotes

# List all files in a collection
qmdx ls mynotes

# List files with a path prefix
qmdx ls journals/2025
qmdx ls qmd://journals/2025
```

## Context Management

```sh
# Add context to current directory (auto-detects collection)
qmdx context add "Description of these files"

# Add context to a specific path
qmdx context add /subfolder "Description for subfolder"

# Add global context to all collections (system message)
qmdx context add / "Always include this context"

# Add context using virtual paths
qmdx context add qmd://journals/ "Context for entire journals collection"
qmdx context add qmd://journals/2024 "Journal entries from 2024"

# List all contexts
qmdx context list

# Check for collections or paths without context
qmdx context check

# Remove context
qmdx context rm qmd://journals/2024
qmdx context rm /  # Remove global context
```

## Document IDs (docid)

Each document has a unique short ID (docid) - the first 6 characters of its content hash.
Docids are shown in search results as `#abc123` and can be used with `get` and `multi-get`:

```sh
# Search returns docid in results
qmdx search "query" --json
# Output: [{"docid": "#abc123", "score": 0.85, "file": "docs/readme.md", ...}]

# Get document by docid
qmdx get "#abc123"
qmdx get abc123              # Leading # is optional

# Docids also work in multi-get comma-separated lists
qmdx multi-get "#abc123, #def456"
```

## Options

```sh
# Search & retrieval
-c, --collection <name>  # Restrict search to collection(s) (repeatable)
-n <num>                 # Number of results
--all                    # Return all matches
--min-score <num>        # Minimum score threshold
--full                   # Show full document content
--intent <text>          # Describe what you're after to sharpen ranking (query)
--no-rerank              # Skip LLM reranking (faster, lower quality)
--full-path              # Show on-disk paths instead of qmd:// URIs

# Get / multi-get
-l <num>                 # Maximum lines per file
--max-bytes <num>        # Skip files larger than this (default 10KB)
--no-line-numbers        # Disable line numbers (on by default for get/multi-get)

# Output format (search, query, multi-get)
--format <kind>          # cli (default) | json | csv | md | xml | files
                         # legacy --json/--csv/--md/--xml/--files still work as aliases

# Multi-project isolation (global flags, run before the command)
--index-dir <dir>        # Place index.yml + index.sqlite (+-shm/-wal) in <dir>; isolates per-project
--models-config <path>   # Shared models.yml (embed/rerank/generate) across --index-dir indexes
                         # default ~/.config/qmdx/models.yml; env: QMDX_INDEX_DIR / QMDX_MODELS_CONFIG
```

Multi-project isolation keeps collections/context/search data per-index but shares the
GGUF model files (`~/.cache/qmdx/models`) and, by default, a single `models.yml`. See
[docs/PROJECT-ISOLATION.ko.md](docs/PROJECT-ISOLATION.ko.md) for the full guide.

## Development

```sh
bun src/cli/qmdx.ts <command>   # Run from source
npm install          # Install deps; prepare hook builds dist/ + git hooks
npm run build        # Rebuild dist/ after editing TypeScript
npm link             # Install this checkout globally as `qmdx`
```

### Install from a git source URL

```sh
# Global CLI directly from the git repo (main, or pin a branch/tag/commit)
npm install -g Will-gabia/qmdx
npm install -g https://github.com/Will-gabia/qmdx.git

# As a project dependency (CLI via `npx qmdx`, or `import { createStore } from 'qmdx'`)
npm install Will-gabia/qmdx
```

The `prepare` lifecycle hook auto-builds `dist/` (gitignored) when missing, so a
git clone/install produces a working CLI without an extra step.`

## Tests

All tests live in `test/`. Run everything:

```sh
npx vitest run --reporter=verbose test/
bun test --preload ./src/test-preload.ts test/
```

## Architecture

- SQLite FTS5 for full-text search (BM25)
- sqlite-vec for vector similarity search
- node-llama-cpp for embeddings (embeddinggemma), reranking (qwen3-reranker), and query expansion (Qwen3)
- Reciprocal Rank Fusion (RRF) for combining results
- Smart chunking: 900 tokens/chunk with 15% overlap, prefers markdown headings as boundaries
- AST-aware chunking: use `--chunk-strategy auto` to chunk code files (.ts/.js/.py/.go/.rs) at function/class/import boundaries via tree-sitter. Default is `regex` (existing behavior). Markdown and unknown file types always use regex chunking.

## Important: Do NOT run automatically

- Never run `qmdx collection add`, `qmdx embed`, or `qmdx update` automatically
- Never modify the SQLite database directly
- Write out example commands for the user to run manually
- Index is stored at `~/.cache/qmdx/index.sqlite`

## Do NOT compile

- Never run `bun build --compile` - it overwrites the shell wrapper and breaks sqlite-vec
- The `qmdx` file is a Node launcher that runs compiled JS from `dist/` - do not replace it
- `npm run build` compiles TypeScript to `dist/` via `tsc -p tsconfig.build.json`

## Releasing

Use `/release <version>` to cut a release. Full changelog standards,
release workflow, and git hook setup are documented in the
[release skill](skills/release/SKILL.md).

Key points:
- Add changelog entries under `## [Unreleased]` **as you make changes**
- The release script renames `[Unreleased]` → `[X.Y.Z] - date` at release time
- Credit external PRs with `#NNN (thanks @username)`
- GitHub releases roll up the full minor series (e.g. 1.2.0 through 1.2.3)
