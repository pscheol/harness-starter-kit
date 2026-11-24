/**
 * 스크립트가 다시 만드는 구간(HK-22b): `<!-- BOARD:BEGIN … -->` ~ `<!-- BOARD:END -->` 처럼 대문자 이름의 BEGIN · END 표지 사이.
 * SDD 보드(specs-index.md)는 이슈를 만들 때마다 scripts/board.sh 가 이 구간을 다시 쓴다. 이 구간만 다르면 사람이 고친 파일로 보지 않는다.
 */
const BLOCK = /(<!-- ([A-Z]+):BEGIN[^\n]*-->)[\s\S]*?(<!-- \2:END -->)/g;

export function hasGenerated(text: string): boolean {
  BLOCK.lastIndex = 0;
  const found = BLOCK.test(text);
  BLOCK.lastIndex = 0;
  return found;
}

/** 생성 구간 안을 비운 글 */
export function withoutGenerated(text: string): string {
  return text.replace(BLOCK, "$1$3");
}

/** 지금 글과 킷 판이 생성 구간 밖에서 같은가(둘 다 생성 구간이 있을 때만 참) */
export function sameOutsideGenerated(current: string, kit: string): boolean {
  return hasGenerated(current) && withoutGenerated(current) === withoutGenerated(kit);
}
