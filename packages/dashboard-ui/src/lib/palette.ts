// 색 설정(사용자 결정 2026-11-24): 좌측 메뉴 · 본문 바탕 색을 다섯 가지 중 고른다. 기본은 쿨 그레이.
// <html data-hx-palette="…"> 속성만 바꾼다(인라인 스타일 없음 — CSP style-src 'self'). 고른 값은 이 브라우저에만 남는다.
export interface Palette {
  id: string;
  label: string;
  description: string;
}

export const PALETTES: readonly Palette[] = [
  { id: "cool-gray", label: "쿨 그레이", description: "흰 메뉴 · 차가운 회색 바탕" },
  { id: "warm-gray", label: "웜 그레이", description: "흰 메뉴 · 따뜻한 회색 바탕" },
  { id: "soft", label: "소프트 사이드바", description: "옅은 회색 메뉴 · 흰 바탕" },
  { id: "navy", label: "미드나이트 네이비", description: "남색 메뉴 · 옅은 회색 바탕" },
  { id: "charcoal", label: "차콜", description: "짙은 회색 메뉴 · 따뜻한 흰 바탕" },
];

export const DEFAULT_PALETTE = "cool-gray";
const KEY = "hx-palette";

function known(id: string | null | undefined): id is string {
  return !!id && PALETTES.some((p) => p.id === id);
}

export function storedPalette(): string {
  try {
    const v = window.localStorage.getItem(KEY);
    return known(v) ? v : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function applyPalette(id: string): string {
  const next = known(id) ? id : DEFAULT_PALETTE;
  document.documentElement.dataset.hxPalette = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // 저장이 막혀 있어도 이번 화면에는 적용된다
  }
  return next;
}
