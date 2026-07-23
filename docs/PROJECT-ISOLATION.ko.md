# 프로젝트별 인덱스 분리 (한글 가이드)

QMDx는 기본적으로 전역 인덱스 하나(`~/.config/qmdx/index.yml` + `~/.cache/qmdx/index.sqlite`)에
모든 데이터를 취합합니다. 하지만 여러 프로젝트의 대용량 검색 데이터를 분리해서 관리하려면
`--index-dir`과 `--models-config` 플래그(또는 환경변수 `QMDX_INDEX_DIR`, `QMDX_MODELS_CONFIG`)로
프로젝트별 인덱스를 완전히 격리할 수 있습니다.

모델 GGUF 파일은 이미 `~/.cache/qmdx/models`에서 공용으로 쓰이므로, 분리 시에도
모델 파일과 모델 설정은 전역으로 공유됩니다.

---

## 핵심 개념

- **인덱스(index)** = `index.yml`(collections/context/models 설정) + `index.sqlite`(FTS·벡터 데이터) +
  `-shm`/`-wal` SQLite 사이드카. `--index-dir`은 이 전체를 한 폴더에 격리합니다.
- **모델 설정(models)** = `embed`/`rerank`/`generate` GGUF URI. `--models-config`로 `index.yml`에서
  분리해 단일 공유 `models.yml`로 빼냅니다.

---

## 인덱스 위치 결정 우선순위 (높음 → 낮음)

| 순위 | 지정 방법 | 위치 |
|------|-----------|------|
| 1 | `--index-dir <dir>` / `QMDX_INDEX_DIR=<dir>` | `<dir>/index.yml` + `<dir>/index.sqlite` |
| 2 | `--index <name>` | 공용 캐시의 평면 파일 `~/.cache/qmdx/<name>.sqlite` |
| 3 | 프로젝트 로컬 `.qmdx/index.yaml` | 현재 디렉터리에서 위로 탐색, `.qmdx/` 안 |
| 4 | 전역 기본값 | `~/.config/qmdx/index.yml` + `~/.cache/qmdx/index.sqlite` |

`--index-dir <dir>`을 주면 `<dir>`에 `index.yml`, `index.sqlite`, `index.sqlite-shm`,
`index.sqlite-wal` 이 모두 생성됩니다.

---

## 모델 설정 공유

`models:` 블록(embed/rerank/generate)은 `--models-config`로 별도 파일로 분리할 수 있습니다.
shared 모드는 다음 중 하나라도 설정되면 자동 활성화됩니다.

- `--index-dir` / `QMDX_INDEX_DIR`
- `--models-config <path>` / `QMDX_MODELS_CONFIG=<path>`

| 상황 | 동작 |
|------|------|
| 아무것도 안 줌 | shared 모드 OFF → 종전대로 `index.yml` 안의 `models:` 블록 사용 |
| `--index-dir`만 줌 | shared 모드 **자동 활성** → `--models-config` 생략 시 기본 `~/.config/qmdx/models.yml` 사용 |
| `--models-config <path>`만 줌 | shared 모드 ON → 전역 인덱스라도 models.yml을 분리해서 씀 |

> **마이그레이션**: shared 모드 첫 실행 시 기존 `index.yml`에 `models:` 블록이 있으면 공유 파일로
> 비파괴적으로 이관합니다. 이후 공유 파일이 단일 소스가 됩니다.

---

## 사용 예시

### 1. 여러 프로젝트 인덱스 분리 (models.yml은 기본 위치 공유)

```sh
qmdx --index-dir ~/qmd-indexes/projA init
qmdx --index-dir ~/qmd-indexes/projB init

qmdx --index-dir ~/qmd-indexes/projA collection add /repo/projA --name projA
qmdx --index-dir ~/qmd-indexes/projA update
qmdx --index-dir ~/qmd-indexes/projA query "오류 처리"

qmdx --index-dir ~/qmd-indexes/projB collection add /repo/projB --name projB
qmdx --index-dir ~/qmd-indexes/projB update
qmdx --index-dir ~/qmd-indexes/projB query "배포 설정"
```

`projA`와 `projB`는 각각 독립된 `index.sqlite`를 가지지만,
`~/.config/qmdx/models.yml` 하나의 모델 설정을 공유합니다.

### 2. models.yml 경로를 명시적으로 지정

```sh
qmdx --index-dir ~/qmd-indexes/projA --models-config ~/.config/qmdx/models.yml init
qmdx --index-dir ~/qmd-indexes/projB --models-config ~/.config/qmdx/models.yml init
```

### 3. 환경변수로 지정 (매 명령마다 플래그 생략)

```sh
export QMDX_INDEX_DIR=~/qmd-indexes/projA
export QMDX_MODELS_CONFIG=~/.config/qmdx/models.yml

qmdx status          # projA 인덱스 상태
qmdx query "검색어"   # projA 인덱스에서 검색
```

### 4. 로컬 `.qmdx/` (프로젝트 폴더 안) — 기존 동작 유지

```sh
cd /repo/projA
qmdx init                # .qmdx/index.yml + .qmdx/index.sqlite 생성 (models: 블록 포함)
qmdx query "..."
```

---

## 디렉터리 구조 예시

```
~/qmd-indexes/
├── projA/
│   ├── index.yml          # collections/context만 (models 없음)
│   ├── index.sqlite
│   ├── index.sqlite-shm
│   └── index.sqlite-wal
└── projB/
    ├── index.yml
    ├── index.sqlite
    ├── index.sqlite-shm
    └── index.sqlite-wal

~/.config/qmdx/
└── models.yml             # 공유 모델 설정 (embed/rerank/generate)

~/.cache/qmdx/
└── models/                # 공유 GGUF 모델 파일 (전 프로젝트 공용)
```

---

## MCP 데몬

`--index-dir`을 쓰면 MCP 데몬의 `mcp.pid`/`mcp.log`도 해당 인덱스 폴더 옆에 저장되어
여러 인덱스의 데몬이 충돌하지 않습니다.

```sh
qmdx --index-dir ~/qmd-indexes/projA mcp --http --daemon
qmdx --index-dir ~/qmd-indexes/projA mcp stop
qmdx --index-dir ~/qmd-indexes/projA status   # MCP 실행 상태 표시
```

---

## 요약

- **완전 기본(플래그 0개)**: 종전과 100% 동일 — 전역 인덱스 하나로 모든 데이터 취합.
- **`--index-dir`만**: 인덱스는 격리, models 설정은 자동으로 분리되어 기본 `~/.config/qmdx/models.yml` 공유.
- **`--models-config <path>`**: models 설정 파일을 명시적 경로로 지정.

기존 워크플로우를 깨뜨리지 않으면서, 멀티 프로젝트가 필요할 때만 점진적으로 격리/공유 설정을 켤 수 있습니다.