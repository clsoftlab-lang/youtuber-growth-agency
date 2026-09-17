// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/worker.js — Cloudflare Workers 변형 (무료 티어, 서버 관리 불필요 = 무인).
//
// index.mjs 와 동일한 태스크 라우팅 + 모델/캐싱/가드레일 규칙으로 Anthropic REST 를 호출합니다.
// API 키는 Worker 시크릿(ANTHROPIC_API_KEY)에서만 읽습니다. 브라우저·리포지토리엔 절대 두지 않습니다.
//   설정:  wrangler secret put ANTHROPIC_API_KEY
//   배포:  wrangler deploy   (server/README.md 참고)
//
// 프런트엔드는 /api/ai 로 {task, payload} 를 POST 하고, 어시스턴트 텍스트를 응답 본문으로 받습니다.
// (프런트의 스트리밍 리더와 호환됩니다. 여기서는 단순·안정성을 위해 비스트리밍으로 전체 텍스트를 반환합니다.)

// 카탈로그는 Worker 번들에 정적 포함이 어려우므로, 서버 프록시와 달리 최소 그라운딩만 인라인합니다.
// (패키지 요약을 프롬프트에 넣어 근거를 유지합니다.)
const CATALOG_HINT =
  "패키지: start(스타트, 월 저가·기초 편집/썸네일), growth(그로스, 월 중가·기획+마케팅 포함, 인기), " +
  "scale(스케일, 월 고가·풀서비스+우선배정). 애드온: 쇼츠 추가편, 썸네일 리디자인, 채널 컨설팅 등. " +
  "장기 계약 할인(3개월 5%, 6개월 10%, 12개월+ 15%), 긴급 할증(+30%).";

const BASE =
  "당신은 '튜브그로스'의 한국어 유튜버 성장 컨설턴트입니다. 제공된 근거 데이터에 기반해 " +
  "간결하고 실용적으로, 반드시 한국어로 답하세요. 데이터에 없는 수치는 지어내지 마세요.";

function buildPrompt(task, payload) {
  const p = payload || {};
  let systemText;
  let userText;
  if (task === "chat") {
    systemText = BASE + " 채널 지표 진단을 바탕으로 우선순위 개선안과 추천 패키지를 제시합니다.\n\n" + CATALOG_HINT;
    userText = `채널 지표와 질문(JSON):\n${JSON.stringify(p)}\n\n개선 제안과 추천 패키지를 알려주세요.`;
  } else if (task === "content") {
    systemText = BASE + " 채널 주제에 맞는 제목과 썸네일 아이디어를 창의적으로 제안합니다.";
    userText = `주제/키워드(JSON):\n${JSON.stringify(p)}\n\n제목 5개, 썸네일 컨셉 4개, 기획 포인트를 제안해 주세요.`;
  } else if (task === "quote") {
    systemText = BASE + " 견적 구성을 고객이 이해하기 쉽게 항목별로 설명합니다.\n\n" + CATALOG_HINT;
    userText = `견적 선택(JSON):\n${JSON.stringify(p)}\n\n각 항목과 총액의 근거를 설명해 주세요.`;
  } else {
    systemText = BASE;
    userText = JSON.stringify(p);
  }
  // system 을 cache_control(ephemeral) 블록으로 → 반복 호출 시 프롬프트 캐시로 비용 절감.
  const system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }];
  const messages = [{ role: "user", content: userText }];
  return { system, messages };
}

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.startsWith("/api/ai")) {
      return new Response("Not found", { status: 404, headers: JSON_HEADERS });
    }

    // 비용우선 기본 모델. env.AI_MODEL 로 claude-sonnet-5 / claude-opus-5 상향 가능.
    const MODEL = (env && env.AI_MODEL) || "claude-haiku-4-5";
    const MAX_TOKENS = Number(env && env.AI_MAX_TOKENS) || 700;
    const isHaiku = MODEL.startsWith("claude-haiku");

    try {
      const { task, payload } = await request.json().catch(() => ({}));
      const { system, messages } = buildPrompt(task, payload);

      const bodyObj = { model: MODEL, max_tokens: MAX_TOKENS, system, messages };
      // Haiku 4.5 는 thinking/effort 미지원(400 방지). 그 외 모델만 adaptive thinking + effort.
      if (!isHaiku) {
        bodyObj.thinking = { type: "adaptive" };
        bodyObj.output_config = { effort: (env && env.AI_EFFORT) || "low" };
      }

      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify(bodyObj)
      });

      if (!apiRes.ok) {
        // 상류 오류 → 프런트가 목업으로 자동 폴백하도록 429 {fallback:true} 반환.
        return new Response(JSON.stringify({ fallback: true }), {
          status: 429,
          headers: { ...JSON_HEADERS, "Content-Type": "application/json; charset=utf-8" }
        });
      }

      const data = await apiRes.json();
      const text = Array.isArray(data.content)
        ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("")
        : "";
      return new Response(text, {
        status: 200,
        headers: { ...JSON_HEADERS, "Content-Type": "text/plain; charset=utf-8" }
      });
    } catch (e) {
      // 네트워크/파싱 오류 → 프런트 목업 폴백을 위해 429 {fallback:true}.
      return new Response(JSON.stringify({ fallback: true }), {
        status: 429,
        headers: { ...JSON_HEADERS, "Content-Type": "application/json; charset=utf-8" }
      });
    }
  }
};
