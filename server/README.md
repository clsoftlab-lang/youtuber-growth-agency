<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# 튜브그로스 AI 백엔드 프록시

정적 프런트엔드(SPA)를 실제 Claude와 연결하는 얇은 프록시입니다. 브라우저는
**절대 API 키를 갖지 않으며**, 이 서버만 서버 측 `ANTHROPIC_API_KEY`로 Claude를 호출합니다.

- 엔드포인트: `POST /api/ai` — 본문 `{ "task": "chat|content|quote", "payload": {...} }`
- 모델: 비용우선 기본 `claude-haiku-4-5` (환경변수 `AI_MODEL` 로 `claude-sonnet-5` / `claude-opus-5` 상향 가능), 응답은 **텍스트 스트리밍**으로 전달
- 저비용: 안정적 system 프롬프트를 `cache_control:{type:'ephemeral'}` 블록으로 전송(프롬프트 캐시), 태스크별 `max_tokens` 상한(기본 700)
- 가드레일: IP별 분당 요청 제한(기본 20) + 월간 토큰 예산(`AI_MONTHLY_TOKEN_CAP`, 기본 2,000,000). 초과 시 HTTP 429 `{fallback:true}` → 프런트는 목업으로 자동 폴백(무인)
- Haiku 4.5 는 adaptive thinking/effort 를 받지 않으므로 자동으로 생략합니다(400 방지). 그 외 모델만 `thinking:{type:'adaptive'}` + `output_config.effort` 사용
- 그라운딩: 리포지토리의 `../data/packages.json`, `../data/experts.json`를 서버에서 로드해 프롬프트에 포함
- SDK: [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk)

## 무인 배포: Cloudflare Workers (무료 티어)

서버를 직접 관리하지 않는 무인 배포 변형입니다. `worker.js` 가 동일한 태스크 라우팅 + 모델/캐싱 규칙으로
Anthropic REST(`POST https://api.anthropic.com/v1/messages`)를 호출합니다. 키는 Worker 시크릿에만 둡니다.

```bash
cd server
npm i -g wrangler                       # 최초 1회
wrangler login
wrangler secret put ANTHROPIC_API_KEY   # 키를 시크릿으로 저장 (리포지토리·vars 금지)
wrangler deploy                          # worker.js 배포 → https://<name>.<subdomain>.workers.dev
```

배포 후 `../ai/config.js` 의 `AI_ENDPOINT` 를 `https://<...>.workers.dev/api/ai` 로 설정하면 실 Claude로 전환됩니다.
설정을 비워두면(데모 기본값) 프런트는 서버 없이 목업으로 동작합니다. 무료 티어라 관리할 서버가 없습니다(무인).

## 설정

```bash
cd server
npm install                 # @anthropic-ai/sdk 설치
cp .env.example .env        # .env 에 실제 키 입력 (커밋 금지)
```

`.env` 예시:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=8787
```

## 실행

Node 20+ 는 `.env` 파일을 기본 지원합니다.

```bash
node --env-file=.env index.mjs
# 또는 npm start (환경변수를 셸에서 직접 주입한 경우)
# 콘솔: AI 프록시 실행 중: http://localhost:8787/api/ai
```

## 프런트엔드 연결

서버를 띄운 뒤 `../ai/config.js` 를 수정합니다.

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

`AI_ENDPOINT`가 비어 있으면 프런트엔드는 서버 없이 결정적 한국어 목업으로 동작합니다(데모 기본값).

## 보안 원칙

- **API 키는 서버에만 둡니다.** 브라우저, 프런트엔드 코드, 리포지토리에 키를 넣지 마세요.
- `.env` 는 `.gitignore` 로 제외됩니다. 커밋 전 `node ../check.mjs` 로 키 유출 스캔을 실행하세요.
- CORS는 데모 편의를 위해 `*` 로 열려 있습니다. 운영 시에는 허용 오리진을 제한하세요.

## 라이선스

Apache-2.0. **Not an official Anthropic product.**
