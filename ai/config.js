// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/config.js — AI 레이어 설정.
//
// AI_ENDPOINT가 비어 있으면(데모 기본값) 브라우저에서 결정적 한국어 목업으로 동작합니다.
// 실제 Claude 연동은 server/ 백엔드 프록시를 띄운 뒤 그 주소를 여기에 넣어 활성화합니다.
//   예: export const AI_ENDPOINT = "http://localhost:8787/api/ai";
//
// 보안: API 키는 절대 이 파일이나 브라우저에 넣지 않습니다. 키는 서버(server/)에만 둡니다.
export const AI_ENDPOINT = "";
