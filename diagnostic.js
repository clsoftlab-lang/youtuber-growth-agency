// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// diagnostic.js — 규칙 기반 채널 진단 엔진 (순수 함수, 부작용 없음)
// 입력: 구독자 수, 평균 조회수, 업로드 주기(일), 주제, 운영 개월수
// 출력: 성장 점수(0~100) + 세부 지표 + 개선 제안

/**
 * 참여율(평균 조회수 / 구독자 수) 점수화. 0~30점.
 * 유튜브에서 조회수가 구독자 대비 높을수록 알고리즘 노출·성장 신호가 강함.
 */
export function scoreEngagement(subscribers, avgViews) {
  const subs = Math.max(1, Number(subscribers) || 0);
  const views = Math.max(0, Number(avgViews) || 0);
  const ratio = views / subs;
  // ratio 1.0(구독자만큼 조회) 이상이면 만점권
  const raw = Math.min(1, ratio / 1.0);
  return { ratio: Number(ratio.toFixed(3)), points: Math.round(raw * 30) };
}

/**
 * 업로드 주기 점수화. 0~25점.
 * 7일(주 1회) 이하가 이상적. 30일 초과면 성장 정체 신호.
 */
export function scoreConsistency(uploadIntervalDays) {
  const days = Math.max(1, Number(uploadIntervalDays) || 999);
  let points;
  if (days <= 3) points = 25;
  else if (days <= 7) points = 22;
  else if (days <= 14) points = 16;
  else if (days <= 21) points = 11;
  else if (days <= 30) points = 7;
  else points = 3;
  return { days, points };
}

/**
 * 규모 대비 성장 잠재력 점수화. 0~20점.
 * 작은 채널일수록 성장 여지가 크다고 보고 가점(초기 성장 탄력).
 */
export function scorePotential(subscribers, months) {
  const subs = Math.max(0, Number(subscribers) || 0);
  const m = Math.max(1, Number(months) || 1);
  const perMonth = subs / m; // 월평균 순증 근사치
  let base;
  if (subs < 1000) base = 20;
  else if (subs < 10000) base = 17;
  else if (subs < 100000) base = 13;
  else base = 9;
  // 월평균 성장이 빠르면 소폭 가점
  const momentum = perMonth >= 2000 ? 3 : perMonth >= 500 ? 2 : 0;
  return { perMonth: Math.round(perMonth), points: Math.min(20, base + momentum) };
}

/**
 * 주제(니치) 경쟁·수요 가중. 0~25점.
 * 수요·수익화가 높은 카테고리에 가점. 알 수 없는 주제는 중간값.
 */
const TOPIC_TABLE = {
  "게임": 22, "뷰티": 21, "푸드": 22, "여행": 20, "교육": 23,
  "it": 23, "테크": 23, "운동": 20, "건강": 20, "브이로그": 18,
  "반려동물": 21, "육아": 19, "경제": 22, "재테크": 23, "공예": 17,
  "diy": 18, "음악": 19, "코미디": 20, "라이프스타일": 18
};

export function scoreTopic(topic) {
  const key = String(topic || "").trim().toLowerCase();
  let points = 15; // 기본값(니치 미분류)
  let matched = null;
  for (const name of Object.keys(TOPIC_TABLE)) {
    if (key.includes(name)) { points = TOPIC_TABLE[name]; matched = name; break; }
  }
  return { matched, points };
}

/**
 * 개선 제안 생성. 각 지표의 약점을 규칙으로 매핑.
 */
export function buildSuggestions(parts, input) {
  const tips = [];
  if (parts.engagement.ratio < 0.3) {
    tips.push({ level: "high", area: "참여율", text: "구독자 대비 조회수가 낮습니다. 첫 15초 훅과 썸네일 CTR을 우선 개선하세요." });
  } else if (parts.engagement.ratio < 0.7) {
    tips.push({ level: "mid", area: "참여율", text: "참여율은 양호합니다. 재생목록·챕터로 세션 시청 시간을 늘려보세요." });
  }
  if (parts.consistency.days > 14) {
    tips.push({ level: "high", area: "업로드 주기", text: `업로드 간격이 ${parts.consistency.days}일입니다. 주 1~2회로 고정하면 알고리즘 노출이 안정됩니다.` });
  } else if (parts.consistency.days > 7) {
    tips.push({ level: "mid", area: "업로드 주기", text: "주 1회 이상으로 끌어올리면 성장 속도가 빨라집니다." });
  }
  if (parts.potential.perMonth < 500 && Number(input.subscribers) < 10000) {
    tips.push({ level: "mid", area: "성장 모멘텀", text: "쇼츠를 병행해 신규 유입 채널을 늘리세요. 쇼츠→롱폼 전환 설계가 핵심입니다." });
  }
  if (!parts.topic.matched) {
    tips.push({ level: "mid", area: "주제", text: "주제가 다소 광범위합니다. 명확한 니치를 정하면 추천 정확도가 올라갑니다." });
  }
  if (tips.length === 0) {
    tips.push({ level: "low", area: "종합", text: "핵심 지표가 모두 건강합니다. 브랜딩·수익화 단계로 확장할 시점입니다." });
  }
  return tips;
}

/**
 * 점수 등급 산정.
 */
export function grade(total) {
  if (total >= 80) return { tier: "A", label: "폭발 성장 준비 완료" };
  if (total >= 65) return { tier: "B", label: "성장 가속 구간" };
  if (total >= 50) return { tier: "C", label: "기반 다지기 단계" };
  if (total >= 35) return { tier: "D", label: "구조 개선 필요" };
  return { tier: "E", label: "재정비 권장" };
}

/**
 * 추천 패키지 매핑(진단 결과 기반).
 */
export function recommendPackage(total, subscribers) {
  const subs = Number(subscribers) || 0;
  if (total >= 70 || subs >= 50000) return "scale";
  if (total >= 45 || subs >= 5000) return "growth";
  return "start";
}

/**
 * 메인 진단 함수. 위 부분 점수를 합산해 종합 결과 반환.
 * @param {{subscribers:number, avgViews:number, uploadIntervalDays:number, topic:string, months:number}} input
 */
export function diagnose(input) {
  const engagement = scoreEngagement(input.subscribers, input.avgViews);
  const consistency = scoreConsistency(input.uploadIntervalDays);
  const potential = scorePotential(input.subscribers, input.months);
  const topic = scoreTopic(input.topic);
  const parts = { engagement, consistency, potential, topic };
  const total = engagement.points + consistency.points + potential.points + topic.points;
  const clamped = Math.max(0, Math.min(100, total));
  return {
    score: clamped,
    grade: grade(clamped),
    parts,
    suggestions: buildSuggestions(parts, input),
    recommendedPackage: recommendPackage(clamped, input.subscribers)
  };
}
