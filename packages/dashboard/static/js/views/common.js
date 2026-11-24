// 화면 모듈 공용: 데이터를 한꺼번에 받고 실패하면 오류 상태를 그린다.
import { clear } from "../dom.js";
import { errorState } from "../ui.js";

/** requests 는 get() 의 promise 목록. 모두 성공하면 data 목록, 하나라도 실패하면 오류 상태를 그리고 null. */
export async function loadAll(ctx, requests, o = {}) {
  const results = await Promise.all(requests);
  if (!ctx.isCurrent()) return null;
  const bad = results.find((r) => !r.ok && !(o.tolerate ?? []).includes(r.error.code));
  if (bad) {
    clear(ctx.host).append(errorState(bad.error, ctx.rerender));
    return null;
  }
  return results;
}

/** 일정 시간마다 fn 을 부르고 화면이 바뀌면 멈춘다. 탭이 숨겨졌을 때는 부르지 않는다. */
export function every(ms, fn) {
  const id = setInterval(() => {
    if (document.visibilityState === "visible") fn();
  }, ms);
  return () => clearInterval(id);
}

export const ACTION = {
  "review-blocker": "리뷰 판단",
  "quality-blocker": "검증 보기",
  "gate-mine": "열어서 승인",
  "gate-others": "열기",
  questions: "답하기",
  "verify-failed": "검증 보기",
  "approval-stale": "다시 승인",
  "worktree-cleanup": "명령 보기",
  harness: "하네스 보기",
  "dispatch-stale": "대기함 보기",
};

export function sortBy(list, key, dir = 1) {
  return [...list].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
}
