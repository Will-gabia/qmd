# qmdx 설치 가이드 (한글)

`qmdx`는 npm 패키지로 설치하거나, 깃 저장소 URL에서 직접 설치할 수 있습니다.
또한 개발용으로 소스를 클론해 로컬 빌드/링크할 수도 있습니다.

---

## 1. npm에서 설치 (기본)

```sh
# 전역 설치
npm install -g qmdx
# 또는 Bun
bun install -g qmdx

# 설치 없이 한 번 실행
npx qmdx ...
bunx qmdx ...
```

> `qmdx`는 이 저장소(`Will-gabia/qmdx`)의 포크 이름입니다. npm에 게시된 이름과
> 저장소명은 다를 수 있으니, 게시 후에는 게시된 패키지명을 그대로 쓰세요.

---

## 2. 깃 소스 URL로 직접 설치

npm에 게시되기 전이나 특정 브랜치/태그/커밋을 쓰고 싶을 때, 깃 URL로 바로 설치할 수 있습니다.
이 방식이 동작하는 이유는 `prepare` 라이프사이클 훅이 `dist/`가 없으면 자동으로 빌드하기
때문입니다 — 깃 저장소는 `dist/`를 gitignore하므로 클론 직후에는 빌드 산물이 없지만,
설치 과정에서 `tsc`로 자동 생성됩니다.

### 전역 CLI 설치

```sh
# 기본(main) 브랜치
npm install -g Will-gabia/qmdx

# 필요 시 브랜치 / 태그 / 커밋 고정
npm install -g Will-gabia/qmdx#<브랜치-또는-태그>
npm install -g https://github.com/Will-gabia/qmdx.git

# Bun
bun install -g Will-gabia/qmdx
bun install -g github:Will-gabia/qmdx
```

설치 후:

```sh
qmdx --version
qmdx status
```

> 깃 설치는 devDependencies(TypeScript 포함)까지 함께 설치되어 자동 빌드가 가능합니다.
> `--omit=dev`로 설치하면 빌드가 안 되며, 이후 devDependencies를 설치하고
> `npm run build`를 직접 실행해야 합니다.

### 기존 프로젝트에 의존성으로 추가

```sh
npm install Will-gabia/qmdx
# 또는 package.json 의존성:
#   "qmdx": "Will-gabia/qmdx"
```

CLI:

```sh
npx qmdx --version
npx qmdx query "검색어"
```

SDK:

```typescript
import { createStore } from 'qmdx'

const store = await createStore({
  dbPath: './my-index.sqlite',
  config: {
    collections: {
      docs: { path: '/path/to/docs', pattern: '**/*.md' },
    },
  },
})

const results = await store.search({ query: '인증 흐름' })
console.log(results.map(r => `${r.title} (${Math.round(r.score * 100)}%)`))
await store.close()
```

---

## 3. 개발용: 소스 클론 / 빌드 / 링크

```sh
git clone https://github.com/Will-gabia/qmdx
cd qmdx

npm install          # 의존성 설치 + prepare 훅이 dist/ 빌드 + git 훅 설치
npm run build        # TypeScript 소스 편집 후 재빌드
npm link             # 이 체크아웃을 전역 `qmdx`로 노출
```

소스를 직접 실행 (빌드 없이 tsx 사용):

```sh
bun src/cli/qmdx.ts status
npx tsx src/cli/qmdx.ts query "검색어"
```

---

## 4. 확인

```sh
which qmdx           # 설치 경로
qmdx --version       # 버전
qmdx doctor          # 설정/인덱스/모델/디바이스 진단
qmdx status          # 현재 인덱스 상태
```

---

## 참고

- 멀티 프로젝트 인덱스 분리: [PROJECT-ISOLATION.ko.md](PROJECT-ISOLATION.ko.md)
- OpenAI 호환 모델 사용: [OPENAI-PROVIDERS.md](OPENAI-PROVIDERS.md)
- 주요 기능: README.md 상단 "Highlights"