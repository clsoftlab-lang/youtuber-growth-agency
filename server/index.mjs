// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — 실 Claude 연동용 백엔드 프록시.
//
// 브라우저는 절대 Anthropic API 키를 갖지 않습니다. 프런트엔드는 이 서버의 POST /api/ai로
// {task, payload}만 보내고, 서버가 서버 측 키(ANTHROPIC_API_KEY)로 Claude를 호출한 뒤
// 생성 텍스트를 스트리밍으로 그대로 흘려보냅니다.
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

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("경고: ANTHROPIC_API_KEY가 설정되지 않았습니다. 요청 시 인증 오류가 발생합니다.");
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

/* ---------- 태스크별 프롬프트 구성(실제 데이터로 grounding) ---------- */
function buildPrompt(task, payload) {
  const p = payload || {};
  const base =
    "당신은 '튜브그로스'의 한국어 유튜버 성장 컨설턴트입니다. 제공된 근거 데이터에 기반해 " +
    "간결하고 실용적으로, 반드시 한국어로 답하세요. 데이터에 없는 수치는 지어내지 마세요.";
  const catalogJson = JSON.stringify({ packages: DATA.packages, addons: DATA.addons });

  if (task === "chat") {
    return {
      system: base + " 채널 지표 진단을 바탕으로 우선순위 개선안과 추천 패키지를 제시합니다.",
      messages: [
        {
          role: "user",
          content: `채널 지표와 질문(JSON):\n${JSON.stringify(p)}\n\n패키지 카탈로그(JSON):\n${catalogJson}\n\n개선 제안과 추천 패키지를 알려주세요.`
        }
      ]
    };
  }
  if (task === "content") {
    return {
      system: base + " 채널 주제에 맞는 제목과 썸네일 아이디어를 창의적으로 제안합니다.",
      messages: [
        {
          role: "user",
          content: `주제/키워드(JSON):\n${JSON.stringify(p)}\n\n제목 5개, 썸네일 컨셉 4개, 기획 포인트를 제안해 주세요.`
        }
      ]
    };
  }
  if (task === "quote") {
    return {
      system: base + " 견적 구성을 고객이 이해하기 쉽게 항목별로 설명합니다.",
      messages: [
        {
          role: "user",
          content: `견적 선택(JSON):\n${JSON.stringify(p)}\n\n패키지 카탈로그(JSON):\n${catalogJson}\n\n각 항목과 총액의 근거를 설명해 주세요.`
        }
      ]
    };
  }
  return { system: base, messages: [{ role: "user", content: JSON.stringify(p) }] };
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

  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 1e6) req.destroy(); // 과도한 페이로드 방지
  });
  req.on("end", async () => {
    try {
      const { task, payload } = JSON.parse(body || "{}");
      const { system, messages } = buildPrompt(task, payload);

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      const stream = client.messages.stream({
        model: "claude-opus-5",
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        system,
        messages
      });
      stream.on("text", (t) => res.write(t));
      await stream.finalMessage();
      res.end();
    } catch (e) {
      console.error("AI 처리 오류:", e);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("AI 서버 오류: " + (e && e.message ? e.message : String(e)));
    }
  });
});

server.listen(PORT, () => {
  console.log(`AI 프록시 실행 중: http://localhost:${PORT}/api/ai`);
});
