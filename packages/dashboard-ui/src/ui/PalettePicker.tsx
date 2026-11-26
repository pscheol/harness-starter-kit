// 색 설정 단추: 머리줄 오른쪽 위 아이콘 → 작은 대화상자에서 다섯 색 중 하나를 고른다. 고르면 바로 바뀌고 이 브라우저에 남는다.
// 번들 크기를 늘리지 않게 이미 쓰는 부품(Button · Dialog · RadioList)만 쓴다.
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Palette as PaletteIcon } from "lucide-react";
import { useState } from "react";
import { applyPalette, PALETTES, storedPalette } from "../lib/palette";

function Swatch({ id }: { id: string }) {
  return (
    <span className="kns-swatch" data-p={id} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

export function PalettePicker() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(storedPalette);
  return (
    <>
      <Button label="색 설정" tooltip="색 설정" isIconOnly variant="ghost" icon={<PaletteIcon size={18} />} onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={setOpen} width={380}>
        <VStack gap={4} padding={5}>
          <Heading level={2}>색 설정</Heading>
          <RadioList label="메뉴 · 바탕 색" value={value} onChange={(v) => setValue(applyPalette(v))}>
            {PALETTES.map((p) => (
              <RadioListItem key={p.id} value={p.id} label={p.label} description={p.description} endContent={<Swatch id={p.id} />} />
            ))}
          </RadioList>
          <Text color="secondary" size="sm">
            고르면 바로 바뀌고 이 브라우저에만 저장됩니다.
          </Text>
          <HStack justify="end">
            <Button label="닫기" onClick={() => setOpen(false)} />
          </HStack>
        </VStack>
      </Dialog>
    </>
  );
}
