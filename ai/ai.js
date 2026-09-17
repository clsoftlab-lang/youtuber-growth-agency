// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/ai.js — 앱의 AI-KIT.
//
// askAI(task, payload, { onToken }) 하나로 세 가지 AI 기능을 처리합니다.
//   - AI_ENDPOINT가 비어 있으면: 앱의 진단/견적 엔진과 패키지·전문가 데이터를 재사용하는
//     결정적(deterministic) 한국어 MockProvider가 응답합니다. (데모 기본값)
//   - AI_ENDPOINT가 설정되면: {task, payload}를 POST하고 응답 텍스트를 스트리밍으로 전달합니다.
//
// 지원 task: "chat"(채널 성장 상담), "content"(제목·썸네일 기획), "quote"(견적 설명).
//
// 순수 로직(diagnose/calcQuote)은 기존 모듈을 그대로 재사용합니다.

import { diagnose, scoreTopic } from "../diagnostic.js";
import { calcQuote, formatWon } from "../quote.js";
import { AI_ENDPOINT } from "./config.js";

/* ---------- 카탈로그(패키지·애드온·전문가) 지연 로딩 + 캐시 ---------- */
let _catalog = null;
async function catalog() {
  if (_catalog) return _catalog;
  const [pkg, exp] = await Promise.all([
    fetch("./data/packages.json").then((r) => r.json()),
    fetch("./data/experts.json").then((r) => r.json())
  ]);
  _catalog = { packages: pkg.packages, addons: pkg.addons, experts: exp.experts };
  return _catalog;
}

/* ---------- 공개 API ---------- */
/**
 * AI 요청 진입점.
 * @param {"chat"|"content"|"quote"} task
 * @param {Object} payload  태스크별 입력
 * @param {{onToken?: (chunk:string)=>void}} [opts]  스트리밍 콜백
 * @returns {Promise<string>} 전체 응답 텍스트
 */
export async function askAI(task, payload, { onToken } = {}) {
  if (!AI_ENDPOINT) {
    const text = await mockReply(task, payload);
    return streamLocal(text, onToken);
  }
  return streamRemote(task, payload, onToken);
}

/* ---------- 원격(실 Claude, 백엔드 프록시) 스트리밍 ---------- */
async function streamRemote(task, payload, onToken) {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload })
  });
  if (!res.ok || !res.body) throw new Error("AI 서버 오류: " + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    if (onToken) onToken(chunk);
  }
  return full;
}

/* ---------- 로컬 목업 스트리밍(타이핑 효과) ---------- */
async function streamLocal(text, onToken) {
  if (!onToken) return text;
  const parts = text.match(/[\s\S]{1,3}/g) || [text];
  for (const p of parts) {
    onToken(p);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 10));
  }
  return text;
}

/* ---------- MockProvider ---------- */
async function mockReply(task, payload) {
  const p = payload || {};
  if (task === "chat") return mockChat(p);
  if (task === "content") return mockContent(p);
  if (task === "quote") return mockQuote(p);
  return "지원하지 않는 요청입니다.";
}

const DEMO_NOTE =
  "데모 모드 안내: 규칙 기반 목업 응답입니다. 실제 AI 연동은 서버 프록시(server/)와 ANTHROPIC_API_KEY로 활성화됩니다.";

async function mockChat(p) {
  const input = {
    subscribers: Number(p.subscribers) || 0,
    avgViews: Number(p.avgViews) || 0,
    uploadIntervalDays: Number(p.uploadIntervalDays) || 7,
    months: Number(p.months) || 1,
    topic: p.topic || ""
  };
  const d = diagnose(input);
  const { packages } = await catalog();
  const pkg = packages.find((x) => x.id === d.recommendedPackage);
  const q = (p.question || "").trim();

  const lines = ["[AI 채널 성장 상담]"];
  if (q) lines.push(`질문: ${q}`);
  lines.push(`현재 진단 점수는 ${d.score}점 (${d.grade.tier}등급 · ${d.grade.label})입니다.`);
  lines.push(
    `참여율(조회수/구독자)은 ${(d.parts.engagement.ratio * 100).toFixed(1)}%, 업로드 주기는 ${d.parts.consistency.days}일입니다.`
  );
  lines.push("");
  lines.push("우선순위 개선 제안:");
  d.suggestions.forEach((s, i) => lines.push(`${i + 1}. [${s.area}] ${s.text}`));
  lines.push("");
  if (pkg) {
    lines.push(`추천 패키지는 '${pkg.name}'입니다. ${pkg.tagline} (월 ${formatWon(pkg.priceMonthly)}).`);
  }
  lines.push(DEMO_NOTE);
  return lines.join("\n");
}

async function mockContent(p) {
  const topic = (p.topic || "콘텐츠").trim();
  const keyword = (p.keyword || "").trim();
  const base = keyword || topic;
  const niche = scoreTopic(topic);

  const titles = [
    `${topic} 입문자가 3일 만에 달라지는 방법`,
    `아무도 안 알려주는 ${base} 꿀팁 7가지`,
    `${base}, 이것만 알면 조회수 10배`,
    `${topic} 초보가 가장 많이 하는 실수 5`,
    `${base} 완전 정복 | 실전 가이드`
  ];
  const thumbs = [
    '클로즈업 표정 + 큰 숫자 "10배" 오버레이, 고대비 컬러',
    "Before/After 2분할 구도, 화살표로 변화 강조",
    "핵심 키워드 3단어 대형 타이포 + 화이트 테두리",
    "호기심 자극 물음표 + 빨간 원으로 포인트 표시"
  ];

  const lines = [`[콘텐츠 기획: ${topic}${keyword ? " · " + keyword : ""}]`, ""];
  if (niche.matched) {
    lines.push(`니치 '${niche.matched}'는 수요·수익화가 높은 편이라 시리즈화에 유리합니다.`);
    lines.push("");
  }
  lines.push("추천 제목 아이디어:");
  titles.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  lines.push("");
  lines.push("썸네일 컨셉:");
  thumbs.forEach((x) => lines.push(`- ${x}`));
  lines.push("");
  lines.push("기획 포인트: 첫 15초 훅에서 결과를 먼저 보여주고, 챕터로 이탈을 줄이세요.");
  lines.push(DEMO_NOTE);
  return lines.join("\n");
}

async function mockQuote(p) {
  const { packages, addons } = await catalog();
  const pkg = packages.find((x) => x.id === p.pkgId) || packages[0];
  const q = calcQuote({
    pkg,
    addonCatalog: addons,
    selectedAddons: p.selectedAddons || {},
    months: Number(p.months) || 1,
    rush: !!p.rush
  });

  const lines = [`[견적 설명: ${pkg.name}]`, pkg.tagline, ""];
  lines.push(`기본: ${pkg.name} × ${q.months}개월 = ${formatWon(q.base)}`);
  q.addonLines.forEach((l) => lines.push(`추가: ${l.name} × ${l.qty} = ${formatWon(l.amount)}`));
  if (q.discount > 0) lines.push(`장기 계약 할인(${Math.round(q.discountRate * 100)}%): -${formatWon(q.discount)}`);
  if (q.rushFee > 0) lines.push(`긴급 할증(${Math.round(q.rushRate * 100)}%): +${formatWon(q.rushFee)}`);
  lines.push(`예상 총액: ${formatWon(q.total)}`);
  lines.push("");
  lines.push("포함 내역: " + pkg.includes.join(", "));
  lines.push(`이 패키지는 월 제작 ${pkg.videosPerMonth}편 규모로 구성됩니다.`);
  if (q.months >= 6) lines.push("장기 계약 시 우선 배정과 할인이 함께 적용되어 비용 효율이 높습니다.");
  lines.push(DEMO_NOTE);
  return lines.join("\n");
}
