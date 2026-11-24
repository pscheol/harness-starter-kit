// 승인 PIN 입력(탭마다 한 번, sessionStorage). PIN 이 틀리면 한 번 더 묻고, 5번 틀려 잠기면 지운다(HK-18 ui.js 의 withPin 과 같은 흐름).
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { pin as storedPin, setPin, type ApiResult } from "../lib/api";
import { normalizePin } from "../lib/pin";
import type { Loose } from "../lib/types";

type WithPin = <T = Loose>(fn: (pin: string) => Promise<ApiResult<T>>) => Promise<ApiResult<T>>;

const PinContext = createContext<WithPin | null>(null);

const CANCELLED = { ok: false as const, status: 0, error: { code: "cancelled", message: "PIN 입력을 취소했습니다" } };

export function PinProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((force: boolean): Promise<string | null> => {
    const cur = storedPin();
    if (cur && !force) return Promise.resolve(cur);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setValue("");
      setOpen(true);
    });
  }, []);

  const finish = useCallback((v: string | null) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(false);
    if (v) setPin(v);
    r?.(v);
  }, []);

  const withPin = useCallback<WithPin>(
    async (fn) => {
      let p = await ask(false);
      if (!p) return CANCELLED;
      let res = await fn(p);
      if (!res.ok && res.error.code === "pin_required") {
        setPin(null);
        p = await ask(true);
        if (!p) return CANCELLED;
        res = await fn(p);
      }
      if (!res.ok && res.error.code === "pin_locked") setPin(null);
      return res;
    },
    [ask],
  );

  const submit = (): void => {
    const v = normalizePin(value);
    if (v) finish(v);
  };

  const ctx = useMemo(() => withPin, [withPin]);
  return (
    <PinContext.Provider value={ctx}>
      {children}
      <Dialog isOpen={open} onOpenChange={(o) => !o && finish(null)} purpose="form" width={420}>
        <VStack gap={4} padding={5}>
          <Heading level={2}>승인 PIN 이 필요합니다</Heading>
          <TextInput label="승인 PIN" value={value} onChange={setValue} onEnter={submit} description="서버를 연 터미널(표준 오류)에만 나온 값입니다. 이 탭에서 한 번만 묻습니다. 파일 · 화면에 저장하지 않습니다." />
          <HStack gap={2} justify="end">
            <Button label="취소" onClick={() => finish(null)} />
            <Button label="확인" variant="primary" onClick={submit} />
          </HStack>
          <Text color="secondary" size="xsm">
            PIN 을 5번 틀리면 서버를 다시 열어야 합니다.
          </Text>
        </VStack>
      </Dialog>
    </PinContext.Provider>
  );
}

export function usePin(): WithPin {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error("PinProvider 안에서만 usePin 을 씁니다");
  return ctx;
}
