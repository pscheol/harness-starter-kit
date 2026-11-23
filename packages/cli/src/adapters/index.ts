/** 하네스 어댑터 목록(03 §3.3 — 새 하네스는 파일 하나 + 이 목록에 한 줄 + layout.json harnesses). */
import { claude } from "./claude";
import { codex } from "./codex";
import { cursor } from "./cursor";
import { kiro } from "./kiro";
import type { HarnessAdapter } from "./types";

export const ADAPTERS: HarnessAdapter[] = [claude, codex, cursor, kiro];

export type { HarnessAdapter, ProjectionContext, Want } from "./types";
