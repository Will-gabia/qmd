# @songth/qmdx · Query Markdown Documents / 쿼리 마크다운 문서

> On-device hybrid search for markdown notes, docs, and knowledge bases —
> BM25 + vector semantic search + LLM reranking, fully local.
>
> 마크다운 노트·문서·지식 베이스를 위한 온디바이스 하이브리드 검색 —
> BM25 + 벡터 의미 검색 + LLM 리랭킹, 모두 로컬에서 동작.

[한국어 안내](#한국어) · [English](#english)

---

## English

**`@songth/qmdx`** is a fork of [`@tobilu/qmd`](https://www.npmjs.com/package/@tobilu/qmd)
([github.com/tobi/qmd](https://github.com/tobi/qmd)) by Tobi Lütke, rebranded
and extended so it can run **side-by-side** with the upstream `qmd` package
without env-var or config collisions.

### Install

```bash
npm install -g @songth/qmdx
qmdx --version   # → qmdx 2.6.3
```

Requires Node.js ≥ 22. GGUF models are cached under `~/.cache/qmdx/models` on
first use.

### Quick start

```bash
qmdx init                              # set up the index (~/.cache/qmdx/)
qmdx collection add ./notes --name mynotes   # index a folder of markdown
qmdx update                             # re-index; runs configured update hooks
qmdx query "deployment notes"           # hybrid search (BM25 + vector + rerank)
qmdx search "exact keyword"             # keyword-only (BM25, fast)
qmdx mcp                                # MCP server (stdio transport)
```

### What's different from upstream `qmd` (tobil/qmd)

QMDx preserves the `qmd://` URN scheme and runtime data format, so existing
databases keep working. The fork adds:

- **`QMDX_*` environment variables** (was `QMD_*`) — intentional rename so the
  fork can coexist with upstream `qmd` on the same machine.
- **Multi-project index isolation** — `--index-dir <dir>` (env `QMDX_INDEX_DIR`)
  places a project's full index (`index.yml` + `index.sqlite` + `-shm`/`-wal`)
  inside `<dir>`, so each project has its own collections/context/search data.
- **Shared models config** — `--models-config <path>` (env `QMDX_MODELS_CONFIG`)
  splits the `models:` block into a single shared `models.yml`, while GGUF model
  files stay shared in `~/.cache/qmdx/models`.
- **OpenAI-compatible providers** — the `openai:` model scheme routes embeddings
  to `/v1/embeddings` and query expansion to `/v1/chat/completions`, so you can
  use a remote OpenAI-compatible endpoint instead of local GGUF models.
- **Install-from-source works** — `prepare` lifecycle hook builds `dist/` when
  missing, so `npm install <git-url>` produces a working CLI out of the box.

### Upstream / credits

- Original package: [`@tobilu/qmd`](https://www.npmjs.com/package/@tobilu/qmd) (MIT, © Tobi Lütke)
- Upstream repo: [github.com/tobi/qmd](https://github.com/tobi/qmd)
- This fork: [github.com/Will-gabia/qmdx](https://github.com/Will-gabia/qmdx) · npm: [@songth/qmdx](https://www.npmjs.com/package/@songth/qmdx)

### Docs

Full README, Korean guides, and changelog live in the
[GitHub repo](https://github.com/Will-gabia/qmdx#readme):
- `docs/PROJECT-ISOLATION.ko.md` — multi-project isolation guide (Korean)
- `docs/INSTALL.ko.md` — install guide (Korean)
- `CHANGELOG.md` — version history

---

## 한국어

**`@songth/qmdx`** 는 Tobi Lütke 의 [`@tobilu/qmd`](https://www.npmjs.com/package/@tobilu/qmd)
([github.com/tobi/qmd](https://github.com/tobi/qmd)) 를 포크(fork)하여 리브랜딩·확장한
패키지로, **원본 `qmd` 와 같은 머신에서 충돌 없이 병행 실행**할 수 있도록 만들었습니다.

### 설치

```bash
npm install -g @songth/qmdx
qmdx --version   # → qmdx 2.6.3
```

요구사항: Node.js ≥ 22. GGUF 모델은 최초 사용 시 `~/.cache/qmdx/models` 에 캐싱됩니다.

### 빠른 시작

```bash
qmdx init                              # 인덱스 초기화 (~/.cache/qmdx/)
qmdx collection add ./notes --name mynotes   # 마크다운 폴더 인덱싱
qmdx update                             # 재인덱싱 (설정된 업데이트 훅 실행)
qmdx query "배포 노트"                 # 하이브리드 검색 (BM25 + 벡터 + 리랭크)
qmdx search "정확한 키워드"            # 키워드 전용 (BM25, 빠름)
qmdx mcp                                # MCP 서버 (stdio)
```

### 원본 `qmd` (tobil/qmd) 와의 차이점

`qmd://` URN 체계와 런타임 데이터 형식은 그대로 보존하여 기존 DB 도 계속 동작합니다.
이 포크에서 추가된 기능:

- **`QMDX_*` 환경변수** (기존 `QMD_*`) — 원본 `qmd` 와 같은 머신에서 병행 실행하기 위해
  의도적으로 이름을 변경했습니다.
- **다중 프로젝트 인덱스 격리** — `--index-dir <dir>` (env `QMDX_INDEX_DIR`) 로
  프로젝트 전체 인덱스(`index.yml` + `index.sqlite` + `-shm`/`-wal`)를 `<dir>` 에 배치하여
  프로젝트별로 컬렉션/컨텍스트/검색 데이터를 분리합니다.
- **공유 모델 설정** — `--models-config <path>` (env `QMDX_MODELS_CONFIG`) 로 `models:` 블록을
  단일 공유 `models.yml` 로 분리. GGUF 모델 파일은 `~/.cache/qmdx/models` 에서 계속 공유됩니다.
- **OpenAI 호환 제공자** — `openai:` 모델 스킴이 임베딩을 `/v1/embeddings`, 쿼리 확장을
  `/v1/chat/completions` 로 라우팅하여 원격 OpenAI 호환 엔드포인트 사용이 가능합니다.
- **소스 설치 지원** — `prepare` 라이프사이클 훅이 `dist/` 가 없으면 빌드하여,
  `npm install <git-url>` 만으로 바로 동작하는 CLI 가 만들어집니다.

### 원본 / 크레딧

- 원본 패키지: [`@tobilu/qmd`](https://www.npmjs.com/package/@tobilu/qmd) (MIT, © Tobi Lütke)
- 원본 저장소: [github.com/tobi/qmd](https://github.com/tobi/qmd)
- 이 포크: [github.com/Will-gabia/qmdx](https://github.com/Will-gabia/qmdx) · npm: [@songth/qmdx](https://www.npmjs.com/package/@songth/qmdx)

### 문서

전체 README, 한국어 가이드, 변경 이력은
[GitHub 저장소](https://github.com/Will-gabia/qmdx#readme) 에 있습니다:
- `docs/PROJECT-ISOLATION.ko.md` — 다중 프로젝트 격리 가이드 (한국어)
- `docs/INSTALL.ko.md` — 설치 가이드 (한국어)
- `CHANGELOG.md` — 버전 이력

---

License: MIT (© Tobi Lütke; fork maintained by Will-gabia).