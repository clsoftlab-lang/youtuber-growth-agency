// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — 실 Claude 연동용 백엔드 프록시 (저비용·무인 지향).
//
// 브라우저는 절대 Anthropic API 키를 갖지 않습니다. 프런트엔드는 이 서버의 POST /api/ai로
// {task, payload}만 보내고, 서버가 서버 측 키(ANTHROPIC_API_KEY)로 Claude를 호출한 뒤
// 생성 텍스트를 스트리밍으로 그대로 흘려보냅니다.
//
// 비용 최적화:
//   - 기본 모델은 비용우선 claude-haiku-4-5 (AI_MODEL 로 상향 가능).
//   - 안정적인 태스크별 system 프롬프트를 cache_control(ephemeral) 블록으로 보내 프롬프트 캐시 활용.
//   - 태스크별 max_tokens 상한(기본 ~700)으로 출력 비용 제한.
//   - IP별 분당 요청 제한 + 월간 토큰 예산 초과 시 429 {fallback:true} 응답(프런트는 목업으로 폴백).
//
// 실행:  ANTHROPIC_API_KEY=... node index.mjs   (또는 .env 사용, README 참고)
// 활성화: 이 서버를 띄운 뒤 ../ai/config.js 의 AI_ENDPOINT 를 이 주소로 설정하세요.

import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;

// 비용우선 기본 모델. 품질을 더 원하면 AI_MODEL 로 claude-sonnet-5 또는 claude-opus-5 로 상향하세요.
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";
// 태스크별 출력 상한(비용 제한). 필요한 태스크에서만 늘리세요.
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 700;
// 비용 가드레일
const RATE_LIMIT_PER_MIN = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 20;
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP) || 2000000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("경고: ANTHROPIC_API_KEY가 설정되지 않았습니다. 요청 시 인증 오류가 발생합니다.");
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Haiku 4.5 는 adaptive thinking / effort 파라미터를 받지 않습니다(400 방지).
const isHaiku = MODEL.startsWith("claude-haiku");

/* ---------- 그라운딩 데이터: 리포지토리의 실제 카탈로그를 서버에서 로드 ---------- */
function loadData() {
  try {
    const dataDir = join(root, "..", "data");
    const pkg = JSON.parse(readFileSync(join(dataDir, "packages.json"), "utf8"));
    const exp = JSON.parse(readFileSync(join(dataDir, "experts.json"), "utf8"));
    return { packages: pkg.packages, addons: pkg.addons, experts: exp.experts };
  } catch (e) {
    console.warn("카탈로그 데이터를 읽지 못했습니다:", e.message);
    return { packages: [], addons: [], experts: [] };
  }
}
const DATA = loadData();
const CATALOG_JSON = JSON.stringify({ packages: DATA.packages, addons: DATA.addons });

/* ---------- 태스크별 프롬프트 구성 ----------
 * system 은 태스크마다 "안정적"(요청 payload 무관)으로 구성해 프롬프트 캐시가 잘 들도록 합니다.
 * 카탈로그 JSON도 안정적이므로 system 에 포함해 캐시 대상으로 삼습니다.
 * 가변적인 요청 payload 만 user 메시지에 담습니다.
 */
const BASE =
  "당신은 '튜브그로스'의 한국어 유튜버 성장 컨설턴트입니다. 제공된 근거 데이터에 기반해 " +
  "간결하고 실용적으로, 반드시 한국어로 답하세요. 데이터에 없는 수치는 지어내지 마세요.";

function buildPrompt(task, payload) {
  const p = payload || {};
  let systemText;
  let userText;

  if (task === "chat") {
    systemText =
      BASE +
      " 채널 지표 진단을 바탕으로 우선순위 개선안과 추천 패키지를 제시합니다.\n\n" +
      "패키지 카탈로그(JSON):\n" + CATALOG_JSON;
    userText = `채널 지표와 질문(JSON):\n${JSON.stringify(p)}\n\n개선 제안과 추천 패키지를 알려주세요.`;
  } else if (task === "content") {
    systemText = BASE + " 채널 주제에 맞는 제목과 썸네일 아이디어를 창의적으로 제안합니다.";
    userText = `주제/키워드(JSON):\n${JSON.stringify(p)}\n\n제목 5개, 썸네일 컨셉 4개, 기획 포인트를 제안해 주세요.`;
  } else if (task === "quote") {
    systemText =
      BASE +
      " 견적 구성을 고객이 이해하기 쉽게 항목별로 설명합니다.\n\n" +
      "패키지 카탈로그(JSON):\n" + CATALOG_JSON;
    userText = `견적 선택(JSON):\n${JSON.stringify(p)}\n\n각 항목과 총액의 근거를 설명해 주세요.`;
  } else {
    systemText = BASE;
    userText = JSON.stringify(p);
  }

  // system 을 블록 배열로 보내고 cache_control(ephemeral) 지정 → 반복 호출 시 캐시 읽어 비용 절감.
  const system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }];
  const messages = [{ role: "user", content: userText }];
  return { system, messages };
}

/* ---------- 비용 가드레일 상태(인메모리) ---------- */
const ipHits = new Map(); // ip -> number[] (최근 요청 타임스탬프)
function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (ipHits.get(ip) || []).filter((t) => t > windowStart);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > RATE_LIMIT_PER_MIN;
}

let monthlyTokens = 0;
let monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
function rollMonthIfNeeded() {
  const nowKey = new Date().toISOString().slice(0, 7);
  if (nowKey !== monthKey) { monthKey = nowKey; monthlyTokens = 0; }
}
function budgetExceeded() {
  rollMonthIfNeeded();
  return monthlyTokens >= MONTHLY_TOKEN_CAP;
}
function accumulateUsage(usage) {
  if (!usage) return;
  const used =
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  monthlyTokens += used;
}

function send429Fallback(res) {
  res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ fallback: true }));
}

/* ---------- HTTP 서버 ---------- */
const server = http.createServer(async (req, res) => {
  // CORS: 정적 프런트엔드(다른 포트/오리진)에서 호출 허용
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/api/ai")) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  // 가드레일: IP별 분당 제한 + 월간 토큰 예산. 초과 시 429 {fallback:true} → 프런트는 목업으로 폴백.
  const ip = req.socket.remoteAddress || "unknown";
  if (rateLimited(ip) || budgetExceeded()) {
    send429Fallback(res);
    return;
  }

  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 1e6) req.destroy(); // 과도한 페이로드 방지
  });
  req.on("end", async () => {
    try {
      const { task, payload } = JSON.parse(body || "{}");
      const { system, messages } = buildPrompt(task, payload);

      const params = { model: MODEL, max_tokens: MAX_TOKENS, system, messages };
      // Haiku 4.5 는 thinking/effort 미지원(400 방지). 그 외 모델만 adaptive thinking + effort 사용.
      if (!isHaiku) {
        params.thinking = { type: "adaptive" };
        params.output_config = { effort: process.env.AI_EFFORT || "low" };
      }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      const stream = client.messages.stream(params);
      stream.on("text", (t) => res.write(t));
      const final = await stream.finalMessage();
      accumulateUsage(final && final.usage);
      res.end();
    } catch (e) {
      console.error("AI 처리 오류:", e);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("AI 서버 오류: " + (e && e.message ? e.message : String(e)));
    }
  });
});

server.listen(PORT, () => {
  console.log(`AI 프록시 실행 중: http://localhost:${PORT}/api/ai  (모델: ${MODEL}, 월 토큰 상한: ${MONTHLY_TOKEN_CAP})`);
});
