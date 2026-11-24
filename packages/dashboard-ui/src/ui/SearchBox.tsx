// 이슈 키 · 문서 경로 찾기. `/` 키로 어디서든 이 칸에 초점이 온다(입력 칸 안에서는 빼고).
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useRef, useState } from "react";
import { navigate } from "../lib/router";
import { searchTarget } from "../lib/search";

export function SearchBox() {
  const [value, setValue] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const input = box.current?.querySelector("input");
      if (input) {
        e.preventDefault();
        input.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div ref={box} role="search">
      <TextInput
        label="이슈 키나 문서 찾기"
        isLabelHidden
        value={value}
        onChange={setValue}
        onEnter={() => {
          const to = searchTarget(value);
          if (!to) return;
          navigate(to);
          setValue("");
        }}
        placeholder="이슈 키 · 문서 찾기  ( / )"
        startIcon="search"
        size="sm"
      />
    </div>
  );
}
