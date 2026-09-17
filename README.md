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

## DEMO-MODE boundaries
**This is a demonstration build. Specifically:**
- **All data is fictional** (channels, experts, reviews, prices) — no real people or brands.
- **The diagnostic is rule-based, not real analytics** — it does not connect to YouTube.
- **Quotes and requests are simulated** — no invoices, contracts, or payments occur.
- **State lives only in your browser's localStorage — it is not a real database** and is not shared or synced.
- **No accounts, no login, no PII collection.**
- A real production build would add: a backend, real YouTube Data API analytics, payments, and authentication.

## 아이디어 출처 / Idea origin
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
