// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — UI 렌더링, 데이터 로딩, localStorage 상태 관리
// 순수 로직은 diagnostic.js / quote.js 모듈에 분리되어 있음.

import { diagnose } from "./diagnostic.js";
import { calcQuote, formatWon } from "./quote.js";
import { askAI } from "./ai/ai.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const STORE_KEY = "tubegrowth.requests.v1";

const state = { packages: [], addons: [], portfolio: [], experts: [], reviews: [] };

/* ---------- localStorage 안전 래퍼 ---------- */
function loadRequests() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("의뢰 데이터를 읽지 못했습니다. 초기화합니다.", e);
    return [];
  }
}
function saveRequests(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("의뢰 데이터를 저장하지 못했습니다.", e);
    toast("저장 공간을 사용할 수 없어 이번 의뢰는 보관되지 않습니다.");
  }
}

/* ---------- 유틸 ---------- */
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}
const won = (n) => formatWon(n);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 로드 실패: ${res.status}`);
  return res.json();
}

/* ---------- 렌더: 패키지 ---------- */
function renderPackages() {
  const grid = $("#packagesGrid");
  grid.innerHTML = state.packages.map((p) => `
    <article class="card ${p.popular ? "popular" : ""}" style="--accent:${p.accent}">
      <div class="accent-bar" style="background:${p.accent}"></div>
      ${p.popular ? '<span class="badge-pop">인기</span>' : ""}
      <h3>${escapeHtml(p.name)}</h3>
      <p class="meta-line">${escapeHtml(p.tagline)}</p>
      <p class="price">${won(p.priceMonthly)}<small> / 월</small></p>
      <p class="meta-line">계약 ${p.durationWeeks}주 · 월 ${p.videosPerMonth}편 제작</p>
      <ul>${p.includes.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      <a class="btn btn-ghost" href="#quote" data-pick="${p.id}">이 패키지로 견적</a>
    </article>`).join("");

  $("#addonsList").innerHTML = state.addons.map((a) => {
    const price = a.rate ? `+${Math.round(a.rate * 100)}%` : won(a.price);
    return `<div class="addon-pill">${escapeHtml(a.name)} <strong>${price}${a.unit ? " / " + escapeHtml(a.unit) : ""}</strong></div>`;
  }).join("");

  $$("[data-pick]", grid).forEach((btn) => btn.addEventListener("click", () => {
    const el = $(`#quotePackages input[value="${btn.dataset.pick}"]`);
    if (el) { el.checked = true; updateQuote(); highlightRadio(); }
  }));
}

/* ---------- 렌더: 포트폴리오 ---------- */
function renderPortfolioFilter() {
  const cats = ["전체", ...new Set(state.portfolio.map((c) => c.category))];
  const row = $("#portfolioFilter");
  row.innerHTML = cats.map((c, i) =>
    `<button class="chip" aria-pressed="${i === 0}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
  $$(".chip", row).forEach((chip) => chip.addEventListener("click", () => {
    $$(".chip", row).forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    renderPortfolioGrid(chip.dataset.cat);
  }));
}
function renderPortfolioGrid(cat = "전체") {
  const items = cat === "전체" ? state.portfolio : state.portfolio.filter((c) => c.category === cat);
  $("#portfolioGrid").innerHTML = items.map((c) => {
    const mult = (c.afterSubs / Math.max(1, c.beforeSubs)).toFixed(1);
    return `
    <article class="card" style="--accent:${c.accent}">
      <div class="accent-bar" style="background:${c.accent}"></div>
      <span class="tag">${escapeHtml(c.category)}</span>
      <h3>${escapeHtml(c.channel)}</h3>
      <div class="growth-line">
        <span class="from">${c.beforeSubs.toLocaleString("ko-KR")}</span>
        <span class="arrow">→</span>
        <span class="to">${c.afterSubs.toLocaleString("ko-KR")}</span>
      </div>
      <p class="meta-line">${c.months}개월 · 구독자 ${mult}배 성장</p>
      <p>${escapeHtml(c.summary)}</p>
      <ul>${c.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
    </article>`;
  }).join("");
}

/* ---------- 렌더: 전문가 ---------- */
function renderExpertFilter() {
  const roles = ["전체", ...new Set(state.experts.map((e) => e.role))];
  $("#expertRole").innerHTML = roles.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
  $("#expertRole").addEventListener("change", renderExpertsGrid);
  $("#expertRating").addEventListener("change", renderExpertsGrid);
}
function renderExpertsGrid() {
  const role = $("#expertRole").value || "전체";
  const minRating = Number($("#expertRating").value) || 0;
  const items = state.experts.filter((e) =>
    (role === "전체" || e.role === role) && e.rating >= minRating);
  const grid = $("#expertsGrid");
  if (items.length === 0) { grid.innerHTML = `<p class="empty">조건에 맞는 전문가가 없습니다.</p>`; return; }
  grid.innerHTML = items.map((e) => {
    const rate = e.ratePerMin ? `${won(e.ratePerMin)} / 완성 1분` : escapeHtml(e.unit || "협의");
    return `
    <article class="card" style="--accent:${e.accent}">
      <div class="accent-bar" style="background:${e.accent}"></div>
      <span class="tag">${escapeHtml(e.role)}</span>
      <h3>${escapeHtml(e.name)}</h3>
      <p class="meta-line"><span class="stars">${"★".repeat(Math.round(e.rating))}</span> ${e.rating.toFixed(1)} · 후기 ${e.reviews} · 경력 ${e.years}년</p>
      <p>${escapeHtml(e.bio)}</p>
      <ul>${e.specialties.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      <p class="price" style="font-size:1.1rem">${rate}</p>
    </article>`;
  }).join("");
}

/* ---------- 렌더: 후기 ---------- */
function renderReviews() {
  $("#reviewsGrid").innerHTML = state.reviews.map((r) => `
    <article class="card">
      <p class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</p>
      <p>“${escapeHtml(r.text)}”</p>
      <p class="meta-line"><strong>${escapeHtml(r.author)}</strong> · ${escapeHtml(r.channel)} · ${escapeHtml(r.date)}</p>
    </article>`).join("");
}

/* ---------- 진단 ---------- */
function ringSVG(score) {
  const r = 46, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return `
  <svg class="score-ring" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="성장 점수 ${score}점">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--border)" stroke-width="12" />
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--accent)" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 60 60)" />
    <text x="60" y="60" text-anchor="middle" font-size="30" font-weight="800" fill="var(--text)">${score}</text>
    <text x="60" y="80" text-anchor="middle" font-size="12" fill="var(--muted)">/ 100</text>
  </svg>`;
}
function bar(label, val, max) {
  const pct = Math.round((val / max) * 100);
  return `<div class="bar-row"><span>${label}</span><span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span><span>${val}/${max}</span></div>`;
}
function handleDiagnose(e) {
  e.preventDefault();
  const f = e.target;
  const input = {
    subscribers: Number(f.subscribers.value),
    avgViews: Number(f.avgViews.value),
    uploadIntervalDays: Number(f.uploadIntervalDays.value),
    months: Number(f.months.value),
    topic: f.topic.value
  };
  const r = diagnose(input);
  const pkg = state.packages.find((p) => p.id === r.recommendedPackage);
  const out = $("#diagnosticResult");
  out.hidden = false;
  out.innerHTML = `
    <div class="score-hero">
      ${ringSVG(r.score)}
      <div class="score-meta">
        <h3>성장 점수 <span class="tier">${r.grade.tier}등급</span></h3>
        <p>${escapeHtml(r.grade.label)}</p>
        <p class="meta-line">참여율(조회수/구독자) ${(r.parts.engagement.ratio * 100).toFixed(1)}%</p>
      </div>
    </div>
    <div class="bars">
      ${bar("참여율", r.parts.engagement.points, 30)}
      ${bar("업로드 주기", r.parts.consistency.points, 25)}
      ${bar("성장 잠재력", r.parts.potential.points, 20)}
      ${bar("주제 경쟁력", r.parts.topic.points, 25)}
    </div>
    <div class="suggestions">
      ${r.suggestions.map((s) => `<div class="suggestion ${s.level}"><span class="area">${escapeHtml(s.area)}</span><br>${escapeHtml(s.text)}</div>`).join("")}
    </div>
    <div class="rec-package">
      추천 패키지: <strong>${pkg ? escapeHtml(pkg.name) : r.recommendedPackage}</strong> —
      <a href="#quote" data-pick="${r.recommendedPackage}">이 패키지로 견적 받기 →</a>
    </div>`;
  const link = out.querySelector("[data-pick]");
  if (link) link.addEventListener("click", () => {
    const el = $(`#quotePackages input[value="${r.recommendedPackage}"]`);
    if (el) { el.checked = true; updateQuote(); highlightRadio(); }
  });
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- 견적 ---------- */
function renderQuoteControls() {
  $("#quotePackages").innerHTML = state.packages.map((p, i) => `
    <label class="radio-card ${i === 0 ? "selected" : ""}">
      <span class="rc-name"><input type="radio" name="qpkg" value="${p.id}" ${i === 0 ? "checked" : ""}>${escapeHtml(p.name)}</span>
      <div class="rc-price">${won(p.priceMonthly)} / 월</div>
    </label>`).join("");
  $("#quoteAddons").innerHTML = state.addons.filter((a) => !a.rate).map((a) => `
    <label>${escapeHtml(a.name)} (${won(a.price)})
      <input type="number" min="0" max="50" step="1" value="0" data-addon="${a.id}">
    </label>`).join("");

  $("#quoteForm").addEventListener("input", () => { updateQuote(); highlightRadio(); });
  $("#quoteForm").addEventListener("submit", handleRequestSubmit);
  updateQuote();
}
function highlightRadio() {
  $$("#quotePackages .radio-card").forEach((l) => {
    const input = l.querySelector("input");
    l.classList.toggle("selected", input.checked);
  });
}
function readQuoteInput() {
  const pkgId = ($('input[name="qpkg"]:checked') || {}).value || state.packages[0]?.id;
  const pkg = state.packages.find((p) => p.id === pkgId);
  const selectedAddons = {};
  $$("[data-addon]").forEach((inp) => { selectedAddons[inp.dataset.addon] = Number(inp.value) || 0; });
  const months = Number($("#quoteMonths").value) || 1;
  const rush = $("#quoteRush").checked;
  return { pkg, addonCatalog: state.addons, selectedAddons, months, rush };
}
function updateQuote() {
  const q = calcQuote(readQuoteInput());
  const lines = [];
  lines.push(`<div class="quote-line"><span>${escapeHtml(readQuoteInput().pkg.name)} × ${q.months}개월</span><span>${won(q.base)}</span></div>`);
  q.addonLines.forEach((l) => lines.push(`<div class="quote-line"><span>${escapeHtml(l.name)} × ${l.qty}</span><span>${won(l.amount)}</span></div>`));
  if (q.discount > 0) lines.push(`<div class="quote-line disc"><span>장기 계약 할인 (${Math.round(q.discountRate * 100)}%)</span><span>-${won(q.discount)}</span></div>`);
  if (q.rushFee > 0) lines.push(`<div class="quote-line"><span>긴급 할증 (${Math.round(q.rushRate * 100)}%)</span><span>+${won(q.rushFee)}</span></div>`);
  lines.push(`<div class="quote-line total"><span>예상 총액</span><span>${won(q.total)}</span></div>`);
  $("#quoteSummary").innerHTML = lines.join("");
  return q;
}

/* ---------- 의뢰 상태 관리 ---------- */
const STATUS_FLOW = ["접수", "상담중", "진행중", "완료"];
function handleRequestSubmit(e) {
  e.preventDefault();
  const q = updateQuote();
  const input = readQuoteInput();
  const channel = $("#reqChannel").value.trim() || "미입력 채널";
  const nick = $("#reqNick").value.trim() || "익명";
  const req = {
    id: "req-" + Date.now().toString(36),
    channel, nick,
    packageId: input.pkg.id,
    packageName: input.pkg.name,
    months: q.months,
    total: q.total,
    status: "접수",
    createdAt: new Date().toISOString().slice(0, 10)
  };
  const list = loadRequests();
  list.unshift(req);
  saveRequests(list);
  renderRequests();
  toast("상담 신청이 접수되었습니다. 내 의뢰에서 확인하세요.");
  $("#reqChannel").value = ""; $("#reqNick").value = "";
  document.getElementById("requests").scrollIntoView({ behavior: "smooth" });
}
function advanceStatus(id) {
  const list = loadRequests();
  const req = list.find((r) => r.id === id);
  if (!req) return;
  const idx = STATUS_FLOW.indexOf(req.status);
  req.status = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)];
  saveRequests(list);
  renderRequests();
}
function removeRequest(id) {
  saveRequests(loadRequests().filter((r) => r.id !== id));
  renderRequests();
}
function renderRequests() {
  const list = loadRequests();
  const box = $("#requestsList");
  if (list.length === 0) {
    box.innerHTML = `<p class="empty">아직 신청한 의뢰가 없습니다. 견적 섹션에서 상담을 신청해 보세요.</p>`;
    return;
  }
  box.innerHTML = list.map((r) => `
    <article class="request-card">
      <div class="req-top">
        <div>
          <h3 style="margin:0">${escapeHtml(r.channel)}</h3>
          <p class="meta-line">${escapeHtml(r.packageName)} · ${r.months}개월 · ${won(r.total)} · 신청일 ${escapeHtml(r.createdAt)}</p>
        </div>
        <span class="status ${r.status}">${r.status}</span>
      </div>
      <div class="req-actions">
        <button data-adv="${r.id}" ${r.status === "완료" ? "disabled" : ""}>다음 단계로</button>
        <button data-del="${r.id}">삭제</button>
      </div>
    </article>`).join("");
  $$("[data-adv]", box).forEach((b) => b.addEventListener("click", () => advanceStatus(b.dataset.adv)));
  $$("[data-del]", box).forEach((b) => b.addEventListener("click", () => removeRequest(b.dataset.del)));
}

/* ---------- AI 어시스턴트 ---------- */
async function runAI(task, payload, outEl, btn) {
  if (!outEl || !btn) return;
  outEl.hidden = false;
  outEl.textContent = "";
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = "생성 중…";
  try {
    await askAI(task, payload, { onToken: (t) => { outEl.textContent += t; } });
  } catch (err) {
    console.error(err);
    outEl.textContent = "AI 응답을 가져오지 못했습니다. 데모 모드는 로컬 HTTP 서버로 실행했는지, 실연동은 server/ 프록시가 켜져 있는지 확인하세요.";
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}
function initAI() {
  const chatBtn = $("#aiChatBtn");
  if (chatBtn) chatBtn.addEventListener("click", () => {
    const f = $("#diagnosticForm");
    const payload = {
      subscribers: Number(f.subscribers.value),
      avgViews: Number(f.avgViews.value),
      uploadIntervalDays: Number(f.uploadIntervalDays.value),
      months: Number(f.months.value),
      topic: f.topic.value,
      question: $("#aiChatInput").value
    };
    runAI("chat", payload, $("#aiChatOutput"), chatBtn);
  });
  const contentBtn = $("#aiContentBtn");
  if (contentBtn) contentBtn.addEventListener("click", () => {
    runAI("content", { topic: $("#aiContentTopic").value, keyword: $("#aiContentKeyword").value }, $("#aiContentOutput"), contentBtn);
  });
  const quoteBtn = $("#aiQuoteBtn");
  if (quoteBtn) quoteBtn.addEventListener("click", () => {
    const inp = readQuoteInput();
    runAI("quote", { pkgId: inp.pkg?.id, selectedAddons: inp.selectedAddons, months: inp.months, rush: inp.rush }, $("#aiQuoteOutput"), quoteBtn);
  });
}

/* ---------- 무인 기능: 오늘의 팁 + 추천 패키지 (온로드 자동 생성) ---------- */
// 날짜로 회전하는 샘플 채널 프로필. 앱의 진단/견적 엔진(askAI 목업)으로 오늘의 팁을 자동 생성합니다.
// AI_ENDPOINT 미설정(데모)에서는 목업으로, 설정 시 실 Claude로 동작하며, 실패해도 목업으로 자동 폴백됩니다.
const DIGEST_SAMPLES = [
  { subscribers: 820, avgViews: 640, uploadIntervalDays: 6, months: 5, topic: "브이로그" },
  { subscribers: 4200, avgViews: 1500, uploadIntervalDays: 12, months: 9, topic: "게임" },
  { subscribers: 15800, avgViews: 6200, uploadIntervalDays: 4, months: 14, topic: "뷰티" },
  { subscribers: 2600, avgViews: 900, uploadIntervalDays: 20, months: 7, topic: "푸드" },
  { subscribers: 9800, avgViews: 3100, uploadIntervalDays: 9, months: 11, topic: "IT" },
  { subscribers: 63000, avgViews: 21000, uploadIntervalDays: 5, months: 22, topic: "재테크" },
  { subscribers: 1400, avgViews: 380, uploadIntervalDays: 28, months: 4, topic: "여행" }
];
async function initAutoDigest() {
  const out = $("#autoDigestOutput");
  if (!out) return;
  const day = Math.floor(Date.now() / 86400000); // 일 단위 회전
  const sample = DIGEST_SAMPLES[day % DIGEST_SAMPLES.length];
  const payload = { ...sample, question: "오늘 이 채널이 가장 먼저 개선할 점 한 가지와 추천 패키지를 알려주세요." };
  out.textContent = "";
  try {
    await askAI("chat", payload, { onToken: (t) => { out.textContent += t; } });
  } catch (err) {
    // askAI 자체가 목업으로 폴백하므로 여기까지 오는 경우는 드뭅니다.
    console.warn("오늘의 팁 생성 실패", err);
    if (!out.textContent) out.textContent = "오늘의 팁을 불러오지 못했습니다. AI 어시스턴트에서 직접 상담을 받아보세요.";
  }
}

/* ---------- 내비게이션 ---------- */
function initNav() {
  const toggle = $("#navToggle");
  const nav = $("#primaryNav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$("a", nav).forEach((a) => a.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }));
}

/* ---------- 부트스트랩 ---------- */
async function init() {
  initNav();
  initAI();
  $("#diagnosticForm").addEventListener("submit", handleDiagnose);
  $("#clearRequests").addEventListener("click", () => {
    if (confirm("모든 의뢰를 삭제할까요?")) { saveRequests([]); renderRequests(); toast("의뢰 목록을 초기화했습니다."); }
  });
  try {
    const [pkg, port, exp, rev] = await Promise.all([
      loadJSON("./data/packages.json"),
      loadJSON("./data/portfolio.json"),
      loadJSON("./data/experts.json"),
      loadJSON("./data/reviews.json")
    ]);
    state.packages = pkg.packages;
    state.addons = pkg.addons;
    state.portfolio = port.cases;
    state.experts = exp.experts;
    state.reviews = rev.reviews;
    renderPackages();
    renderPortfolioFilter();
    renderPortfolioGrid();
    renderExpertFilter();
    renderExpertsGrid();
    renderReviews();
    renderQuoteControls();
    renderRequests();
    initAutoDigest(); // 무인: 온로드 오늘의 팁 자동 생성
  } catch (err) {
    console.error(err);
    toast("데이터를 불러오지 못했습니다. 로컬 서버로 실행했는지 확인하세요.");
  }
}

document.addEventListener("DOMContentLoaded", init);
