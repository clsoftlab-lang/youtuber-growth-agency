<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# 튜브그로스 AI 백엔드 프록시

정적 프런트엔드(SPA)를 실제 Claude와 연결하는 얇은 프록시입니다. 브라우저는
**절대 API 키를 갖지 않으며**, 이 서버만 서버 측 `ANTHROPIC_API_KEY`로 Claude를 호출합니다.

- 엔드포인트: `POST /api/ai` — 본문 `{ "task": "chat|content|quote", "payload": {...} }`
- 모델: `claude-opus-5` (adaptive thinking), 응답은 **텍스트 스트리밍**으로 전달
- 그라운딩: 리포지토리의 `../data/packages.json`, `../data/experts.json`를 서버에서 로드해 프롬프트에 포함
- SDK: [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk)

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
