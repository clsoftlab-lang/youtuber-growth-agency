<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# TubeGrowth — YouTuber Growth Marketing Agency (Demo)

A no-build static web app for a fictional agency that helps aspiring YouTubers grow through
**video editing, thumbnails, content planning, and marketing**. It includes a working,
rule-based **channel diagnostic engine** and a **quote calculator**.

> **한국어 문서: [README.ko.md](./README.ko.md)**

**LIVE DEMO: https://clsoftlab-lang.github.io/youtuber-growth-agency/**

## What it is
- Service packages (editing / thumbnail / planning / marketing) with prices and durations.
- Portfolio of fictional growth cases (filterable by category).
- **Channel diagnostic tool** — enter subscribers, average views, upload interval, topic and
  months active → get a growth score (0–100), per-metric bars, improvement tips, and a
  recommended package. Runs fully in the browser via a pure rule-based engine.
- **Request & quote flow** — pick a package + add-ons + term → automatic quote → submit a
  consultation request → track its progress status (접수 → 상담중 → 진행중 → 완료).
- Editor/expert matching with specialty and rating filters.
- "My Requests" and customer reviews.

## Run locally
No build step and no dependencies. Serve the folder over HTTP (ES modules require it):

```bash
python -m http.server 9006
# open http://localhost:9006
```

Or with Node: `npx serve .`

## Verify
```bash
node check.mjs      # JSON parse + node --check all JS + HTML containers + unit tests
```

## Features
| Area | Detail |
| --- | --- |
| Diagnostic | Pure `diagnostic.js`: engagement (0–30), consistency (0–25), potential (0–20), topic (0–25) |
| Quote | Pure `quote.js`: base × months + add-ons − term discount + rush surcharge |
| Data | 12 portfolio cases + 12 experts + 3 packages + 5 add-ons + 8 reviews (`data/*.json`) |
| State | Requests persisted in `localStorage` (try/catch guarded, resettable) |
| UI | Responsive, mobile-first, light + dark via `prefers-color-scheme`, Korean, inline-SVG only |

## How the diagnostic works
`diagnose(input)` sums four independent sub-scores:
1. **Engagement** — average views ÷ subscribers, capped at ratio 1.0 → up to 30 pts.
2. **Consistency** — upload interval in days, banded (≤3d best, >30d worst) → up to 25 pts.
3. **Potential** — smaller channels score higher (more headroom) + growth-momentum bonus → up to 20 pts.
4. **Topic** — niche demand/monetization table lookup; unknown topics get a neutral score → up to 25 pts.

The total (0–100) maps to a grade (A–E), tailored suggestions, and a recommended package.

## How the quote works
`calcQuote({ pkg, addonCatalog, selectedAddons, months, rush })`:
`base = pkg.priceMonthly × months`, plus quantity-based add-ons = subtotal.
A term discount (3m 5%, 6m 10%, 12m+ 15%) is subtracted, then an optional rush surcharge
(+30%) is applied on the discounted amount to reach the total.

## 🤖 AI 기능 (API 연동)

세 가지 AI 기능이 추가되었습니다 (모두 앱의 진단/견적 엔진과 패키지·전문가 데이터를 재사용):

1. **AI 채널 성장 상담 챗봇** — 채널 진단 결과 기반 맞춤 조언.
2. **콘텐츠 기획/제목·썸네일 아이디어 생성**.
3. **견적/패키지 추천 설명**.

**데모 = 목업(mock).** 기본값에서 `ai/config.js` 의 `AI_ENDPOINT` 가 비어 있으며,
브라우저에서 결정적(deterministic) 한국어 MockProvider가 즉시 응답합니다. 별도 키·서버·네트워크가 필요 없습니다.

**실제 AI 활성화.** 백엔드 프록시로 전환합니다.

```bash
cd server
npm install                       # @anthropic-ai/sdk
cp .env.example .env              # .env 에 ANTHROPIC_API_KEY 입력 (커밋 금지)
node --env-file=.env index.mjs    # http://localhost:8787/api/ai
```

그런 다음 `ai/config.js` 를 수정합니다.

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

- 모델: 비용우선 기본 **`claude-haiku-4-5`** (환경변수 `AI_MODEL` 로 `claude-sonnet-5`/`claude-opus-5` 상향 가능), 응답은 텍스트 스트리밍.
- 서버는 `data/*.json` 카탈로그를 로드해 프롬프트에 grounding.
- **BOLD: API 키는 서버 측에만 둡니다. 브라우저·프런트엔드 코드·리포지토리에는 절대 키를 넣지 않습니다.** `.env` 는 `.gitignore` 로 제외됩니다.

자세한 내용: [`server/README.md`](./server/README.md). 검증: `node check.mjs` 가 `ai/`·`server/` 문법, `AI_ENDPOINT` 공백, 실제 키 형식 노출을 함께 점검합니다.

## ⚙️ 고도화 — 무인·저비용 실 AI 연동

이 앱은 **무인(autonomous)·저비용(cost-efficient)·실 AI(real Claude)** 를 목표로 고도화되었습니다.

**비용 모델.** 기본 모델은 비용우선 **Claude Haiku 4.5**(대략 입력 $1 / 출력 $5 per MTok)이며,
안정적인 태스크별 system 프롬프트를 **프롬프트 캐시**(`cache_control:{type:'ephemeral'}`)로 보내 반복 호출 비용을 낮춥니다.
태스크별 `max_tokens` 상한(기본 700)으로 출력 비용을 제한하고, **월간 토큰 예산**(`AI_MONTHLY_TOKEN_CAP`, 기본 2,000,000)과
**IP별 분당 요청 제한**(기본 20)으로 가드레일을 둡니다. 예산 초과 시 서버는 429 `{fallback:true}` 를 반환합니다.

**대략적 비용 견적.** 요청당 평균 입력 ~1.5K / 출력 ~0.5K 토큰을 가정하면, Haiku 4.5 기준 **1,000요청 ≈ $3.75**
(입력 1.5M×$1 + 출력 0.5M×$5 = $1.5 + $2.5). 프롬프트 캐시가 반복되는 system·카탈로그 토큰을 크게 할인해 실제 비용은 더 낮아집니다.
`AI_MODEL` 을 Sonnet/Opus 로 올리면 품질과 비용이 함께 올라갑니다.

**무료 무인 배포(원클릭 급).** 관리할 서버가 없는 **Cloudflare Workers** 변형(`server/worker.js` + `server/wrangler.toml`)을 제공합니다.
`wrangler secret put ANTHROPIC_API_KEY` 로 키를 시크릿에 넣고 `wrangler deploy` 하면 끝입니다(무료 티어). 상세: [`server/README.md`](./server/README.md).

**무인 자동 폴백(never-breaks).** 엔드포인트 호출이 실패하거나 429 `{fallback:true}` / 네트워크 오류가 발생하면
`ai/ai.js` 가 자동으로 기존 **목업**으로 폴백합니다. 그래서 앱은 서버가 없거나 예산이 소진돼도 절대 멈추지 않습니다.

**무인 자동 기능.** 페이지 로드 시 앱의 진단/견적 엔진과 `askAI` 로 **"채널 성장 오늘의 팁 + 추천 패키지"** 를 자동 생성합니다
(AI 어시스턴트 섹션 상단). 오프라인 목업에서도 동작합니다.

> **API keys are server-side only — never in the browser or repo.**

## DEMO-MODE boundaries
**This is a demonstration build. Specifically:**
- **All data is fictional** (channels, experts, reviews, prices) — no real people or brands.
- **The diagnostic is rule-based, not real analytics** — it does not connect to YouTube.
- **Quotes and requests are simulated** — no invoices, contracts, or payments occur.
- **State lives only in your browser's localStorage — it is not a real database** and is not shared or synced.
- **No accounts, no login, no PII collection.**
- A real production build would add: a backend, real YouTube Data API analytics, payments, and authentication.

## 🎓 아이디어 출처 / Idea origin
The seed idea came from the entrepreneurship class taught by Dr. Lee Il-guk at Yongin University
(용인대학교). The students' startup ideas were exceptionally creative; this is one of the standout
ideas from that class, finally brought to life as a working service — with admiration and gratitude
to those students. No student personal information is included.

## Contributors
- Dr. Lee Il-guk (이일국)
- LWJ
- LMJ
- Claude

## License
- Code: **Apache-2.0** (see [LICENSE](./LICENSE)).
- Documentation: **CC BY 4.0**.

**Not an official Anthropic product.**
