// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// quote.js — 견적 계산 엔진 (순수 함수, 부작용 없음)
// 입력: 패키지 선택 + 애드온 + 계약 기간(개월) + 긴급 여부
// 출력: 항목별 금액 + 할인 + 총액

/**
 * 계약 기간에 따른 할인율. 길게 계약할수록 할인.
 */
export function termDiscountRate(months) {
  const m = Number(months) || 1;
  if (m >= 12) return 0.15;
  if (m >= 6) return 0.10;
  if (m >= 3) return 0.05;
  return 0;
}

/**
 * 애드온 합계 계산.
 * @param {Array} addons 카탈로그(전체 애드온 정의)
 * @param {Object} selected {addonId: quantity}
 */
export function sumAddons(addons, selected) {
  let total = 0;
  const lines = [];
  for (const a of addons || []) {
    if (a.rate) continue; // 비율형(긴급 등)은 별도 처리
    const qty = Math.max(0, Number(selected?.[a.id]) || 0);
    if (qty > 0) {
      const amount = a.price * qty;
      total += amount;
      lines.push({ id: a.id, name: a.name, qty, unit: a.unit, amount });
    }
  }
  return { total, lines };
}

/**
 * 긴급 작업 할증 비율 조회.
 */
export function rushRate(addons) {
  const rush = (addons || []).find((a) => a.id === "rush");
  return rush?.rate || 0.3;
}

/**
 * 메인 견적 계산.
 * @param {Object} params
 * @param {Object} params.pkg 선택한 패키지 객체
 * @param {Array} params.addonCatalog 애드온 카탈로그
 * @param {Object} params.selectedAddons {addonId: qty}
 * @param {number} params.months 계약 개월수
 * @param {boolean} params.rush 긴급 여부
 */
export function calcQuote({ pkg, addonCatalog = [], selectedAddons = {}, months = 1, rush = false }) {
  if (!pkg) throw new Error("패키지를 선택해야 합니다.");
  const m = Math.max(1, Number(months) || 1);
  const base = pkg.priceMonthly * m;
  const addons = sumAddons(addonCatalog, selectedAddons);
  const subtotal = base + addons.total;

  const discRate = termDiscountRate(m);
  const discount = Math.round(subtotal * discRate);
  const afterDiscount = subtotal - discount;

  const rRate = rush ? rushRate(addonCatalog) : 0;
  const rushFee = Math.round(afterDiscount * rRate);

  const total = afterDiscount + rushFee;

  return {
    months: m,
    base,
    addonLines: addons.lines,
    addonTotal: addons.total,
    subtotal,
    discountRate: discRate,
    discount,
    rushRate: rRate,
    rushFee,
    total
  };
}

/**
 * 통화 포맷(원).
 */
export function formatWon(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("ko-KR") + "원";
}
