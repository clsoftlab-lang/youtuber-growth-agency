// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — 빌드 없는 정합성 검사기
//  1) 모든 data/*.json 파싱
//  2) 모든 .js 파일 `node --check` 문법 검사
//  3) index.html 필수 컨테이너 존재 확인
//  4) diagnostic.js 단위 테스트
//  5) quote.js 단위 테스트

import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = dirname(fileURLToPath(import.meta.url));
let passed = 0;
const fail = (msg) => { console.error("  ✗ " + msg); process.exitCode = 1; };
const ok = (msg) => { passed++; console.log("  ✓ " + msg); };

/* 1) JSON 파싱 */
console.log("[1] data/*.json 파싱");
const dataDir = join(root, "data");
const jsonFiles = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
assert.ok(jsonFiles.length >= 4, "data JSON은 최소 4개여야 합니다");
const data = {};
for (const f of jsonFiles) {
  try {
    data[f] = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
    ok(`${f} 파싱 성공`);
  } catch (e) { fail(`${f} 파싱 실패: ${e.message}`); }
}

/* 데이터 시드 개수 검증 (포트폴리오 + 전문가 20+ ) */
console.log("[1b] 시드 데이터 개수");
const nPort = data["portfolio.json"]?.cases?.length || 0;
const nExp = data["experts.json"]?.experts?.length || 0;
assert.ok(nPort + nExp >= 20, `포트폴리오+전문가 합계 20+ 필요 (현재 ${nPort + nExp})`);
ok(`포트폴리오 ${nPort} + 전문가 ${nExp} = ${nPort + nExp} (>= 20)`);
assert.ok((data["packages.json"]?.packages?.length || 0) >= 3, "패키지 3개 이상");
ok(`패키지 ${data["packages.json"].packages.length}개`);

/* 2) node --check 모든 JS */
console.log("[2] JS 문법 검사 (node --check)");
function collectJS(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectJS(p));
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const js of collectJS(root)) {
  try {
    execFileSync(process.execPath, ["--check", js], { stdio: "pipe" });
    ok(`${js.replace(root, ".")} 문법 OK`);
  } catch (e) { fail(`${js} 문법 오류: ${e.stderr?.toString() || e.message}`); }
}

/* 3) index.html 필수 컨테이너 */
console.log("[3] index.html 컨테이너 확인");
const html = readFileSync(join(root, "index.html"), "utf8");
const requiredIds = [
  "packagesGrid", "addonsList", "portfolioGrid", "portfolioFilter",
  "diagnosticForm", "diagnosticResult", "quoteForm", "quotePackages",
  "quoteAddons", "quoteSummary", "expertsGrid", "expertFilter",
  "requestsList", "reviewsGrid", "primaryNav", "navToggle",
  "ai", "aiChatBtn", "aiChatOutput", "aiContentBtn", "aiContentOutput",
  "aiQuoteBtn", "aiQuoteOutput", "autoDigest", "autoDigestOutput"
];
for (const id of requiredIds) {
  if (html.includes(`id="${id}"`)) ok(`#${id} 존재`);
  else fail(`#${id} 누락`);
}
assert.ok(html.includes('type="module"'), "ES module 스크립트 태그 필요");
ok("ES module 스크립트 태그 존재");

/* 4) diagnostic.js 단위 테스트 */
console.log("[4] diagnostic.js 단위 테스트");
const diag = await import("./diagnostic.js");
{
  // 참여율: 조회수=구독자면 만점(30)
  assert.equal(diag.scoreEngagement(1000, 1000).points, 30);
  ok("scoreEngagement: 조회수=구독자 → 30점");
  assert.equal(diag.scoreEngagement(1000, 0).points, 0);
  ok("scoreEngagement: 조회수 0 → 0점");
  // 업로드 주기: 짧을수록 높음
  assert.ok(diag.scoreConsistency(2).points > diag.scoreConsistency(45).points);
  ok("scoreConsistency: 짧은 주기가 더 높은 점수");
  assert.equal(diag.scoreConsistency(2).points, 25);
  ok("scoreConsistency: 2일 → 25점(만점)");
  // 잠재력: 작은 채널이 더 높음
  assert.ok(diag.scorePotential(500, 6).points > diag.scorePotential(200000, 6).points);
  ok("scorePotential: 소형 채널 가점");
  // 주제 매칭
  assert.equal(diag.scoreTopic("게임 리뷰").matched, "게임");
  ok("scoreTopic: '게임 리뷰' → 게임 매칭");
  assert.equal(diag.scoreTopic("무작위주제xyz").matched, null);
  ok("scoreTopic: 미분류 주제 → null");
  // 종합 진단: 결과 구조 + 범위
  const r = diag.diagnose({ subscribers: 3200, avgViews: 1500, uploadIntervalDays: 10, months: 8, topic: "브이로그" });
  assert.ok(r.score >= 0 && r.score <= 100, "점수 0~100 범위");
  assert.ok(["A", "B", "C", "D", "E"].includes(r.grade.tier), "등급 유효");
  assert.ok(Array.isArray(r.suggestions) && r.suggestions.length >= 1, "제안 1개 이상");
  assert.ok(["start", "growth", "scale"].includes(r.recommendedPackage), "추천 패키지 유효");
  ok(`diagnose 종합: score=${r.score}, grade=${r.grade.tier}, pkg=${r.recommendedPackage}`);
  // 강한 채널이 약한 채널보다 높은 점수
  const strong = diag.diagnose({ subscribers: 5000, avgViews: 6000, uploadIntervalDays: 3, months: 6, topic: "IT" });
  const weak = diag.diagnose({ subscribers: 50000, avgViews: 200, uploadIntervalDays: 60, months: 40, topic: "무작위" });
  assert.ok(strong.score > weak.score, "건강한 채널 > 정체 채널");
  ok(`상대 비교: 건강(${strong.score}) > 정체(${weak.score})`);
}

/* 5) quote.js 단위 테스트 */
console.log("[5] quote.js 단위 테스트");
const quote = await import("./quote.js");
{
  const pkgs = data["packages.json"].packages;
  const addons = data["packages.json"].addons;
  const growth = pkgs.find((p) => p.id === "growth");
  // 기본: 애드온 없음, 1개월, 할인 없음
  const q1 = quote.calcQuote({ pkg: growth, addonCatalog: addons, selectedAddons: {}, months: 1, rush: false });
  assert.equal(q1.total, growth.priceMonthly);
  ok(`기본 견적: 1개월 = ${quote.formatWon(q1.total)}`);
  // 장기 할인: 12개월 15%
  assert.equal(quote.termDiscountRate(12), 0.15);
  assert.equal(quote.termDiscountRate(6), 0.10);
  assert.equal(quote.termDiscountRate(1), 0);
  ok("termDiscountRate: 12→15%, 6→10%, 1→0%");
  const q12 = quote.calcQuote({ pkg: growth, addonCatalog: addons, selectedAddons: {}, months: 12, rush: false });
  assert.equal(q12.discount, Math.round(growth.priceMonthly * 12 * 0.15));
  assert.ok(q12.total < growth.priceMonthly * 12, "할인 적용으로 총액 감소");
  ok(`12개월 할인 견적: ${quote.formatWon(q12.total)} (할인 ${quote.formatWon(q12.discount)})`);
  // 애드온 합산
  const q2 = quote.calcQuote({ pkg: growth, addonCatalog: addons, selectedAddons: { "extra-short": 3 }, months: 1, rush: false });
  const shortPrice = addons.find((a) => a.id === "extra-short").price;
  assert.equal(q2.addonTotal, shortPrice * 3);
  ok(`애드온 합산: 쇼츠 3편 = ${quote.formatWon(q2.addonTotal)}`);
  // 긴급 할증
  const q3 = quote.calcQuote({ pkg: growth, addonCatalog: addons, selectedAddons: {}, months: 1, rush: true });
  assert.ok(q3.rushFee > 0 && q3.total > q1.total, "긴급 할증 적용");
  ok(`긴급 할증: +${quote.formatWon(q3.rushFee)}`);
  // 패키지 미선택 에러
  assert.throws(() => quote.calcQuote({ pkg: null }), /패키지/);
  ok("패키지 미선택 시 에러 발생");
  // 포맷
  assert.equal(quote.formatWon(1800000), "1,800,000원");
  ok("formatWon 포맷 확인");
}

/* 6) AI 레이어 검사 */
console.log("[6] AI 레이어");

// 6a) ai/ + server/ 하위 JS 문법 검사 (node --check)
for (const sub of ["ai", "server"]) {
  const dir = join(root, sub);
  let files = [];
  try { files = collectJS(dir); } catch { fail(`${sub}/ 디렉터리를 찾을 수 없음`); }
  assert.ok(files.length >= 1, `${sub}/ 에 JS 파일이 있어야 함`);
  for (const js of files) {
    try {
      execFileSync(process.execPath, ["--check", js], { stdio: "pipe" });
      ok(`${js.replace(root, ".")} 문법 OK`);
    } catch (e) { fail(`${js} 문법 오류: ${e.stderr?.toString() || e.message}`); }
  }
}

// 6a-2) 무인 배포 변형(Cloudflare Workers) 파일 존재 확인
for (const rel of ["server/worker.js", "server/wrangler.toml"]) {
  try { readFileSync(join(root, rel), "utf8"); ok(`${rel} 존재`); }
  catch { fail(`${rel} 누락(무인 배포 변형 필요)`); }
}

// 6b) 데모 배포는 AI_ENDPOINT가 비어 있어야 함(목업 모드)
const aiConfig = await import("./ai/config.js");
assert.ok("AI_ENDPOINT" in aiConfig, "ai/config.js 는 AI_ENDPOINT 를 export 해야 함");
assert.equal(aiConfig.AI_ENDPOINT, "", "데모 배포는 AI_ENDPOINT가 비어 있어야 함(목업 모드)");
ok("AI_ENDPOINT 비어 있음(목업 모드)");

// 6c) 실제 Anthropic 키 형식이 리포지토리에 노출되지 않았는지 스캔
const keyRe = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
function scanFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...scanFiles(p));
    else if (/\.(js|mjs|json|md|html|css|txt|yml|yaml|example|env)$/.test(e.name)) out.push(p);
  }
  return out;
}
let leaks = 0;
for (const f of scanFiles(root)) {
  if (keyRe.test(readFileSync(f, "utf8"))) { fail(`실제 API 키 형식 노출: ${f.replace(root, ".")}`); leaks++; }
}
if (leaks === 0) ok("실제 Anthropic 키 형식 미검출");

console.log(`\n총 ${passed}개 검사 통과.`);
if (process.exitCode) { console.error("일부 검사 실패."); }
else { console.log("모든 검사 통과 ✅"); }
