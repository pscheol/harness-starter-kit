// 화면 틀: 모든 화면이 같은 머리(이동 경로 · 제목 · 한 줄 설명 · 도구) + 같은 본문 간격을 쓴다. 정렬 · 간격은 이 한 곳에서만 정한다(HK-26 R2).
import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, type ReactNode } from "react";
import { PalettePicker } from "./PalettePicker";
import { SearchBox } from "./SearchBox";

export interface Crumb {
  label: string;
  path?: string;
}

export interface PageProps {
  title: string;
  sub?: ReactNode;
  crumbs?: Crumb[];
  tools?: ReactNode;
  /** 이슈 키 찾기 칸(기본 켬) */
  search?: boolean;
  /** 글 · 폼 화면은 본문 폭을 이만큼으로 줄인다(px, 기본은 가득) */
  width?: number;
  children: ReactNode;
}

/** 이동한 뒤 h1 로 초점을 옮긴다(화면 읽기 프로그램 · 키보드). 초점 링은 제목 글자 폭에만 걸린다. */
function usePageFocus(title: string): void {
  useEffect(() => {
    document.title = `${title} · harnessync 관리 페이지`;
    const h1 = document.getElementById("page-title");
    if (h1) {
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
  }, [title]);
}

export function Page({ title, sub, crumbs, tools, search = true, width, children }: PageProps) {
  usePageFocus(title);
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader padding={5} paddingBlockEnd={4}>
          <VStack gap={2}>
            {crumbs?.length ? (
              <Breadcrumbs label="이동 경로" variant="supporting">
                {crumbs.map((c, i) => (
                  <BreadcrumbItem key={`${c.label}${i}`} {...(c.path ? { href: c.path } : { isCurrent: i === crumbs.length - 1 })}>
                    {c.label}
                  </BreadcrumbItem>
                ))}
              </Breadcrumbs>
            ) : null}
            <HStack gap={4} wrap="wrap" align="center" justify="between">
              <VStack gap={1}>
                <Heading level={1} id="page-title">
                  {title}
                </Heading>
                {sub ? (
                  <Text color="secondary" size="sm">
                    {sub}
                  </Text>
                ) : null}
              </VStack>
              <HStack gap={2} wrap="wrap" align="center">
                {tools}
                {search ? <SearchBox /> : null}
                <PalettePicker />
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={5} role="region" label={title}>
          <VStack gap={5} {...(width ? { maxWidth: width } : {})}>
            {children}
          </VStack>
        </LayoutContent>
      }
    />
  );
}

/** 카드 묶음 사이의 구역 머리: 굵은 이름 + 흐린 설명 + 오른쪽 링크 */
export function Section({ title, meta, action, children }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <VStack gap={3}>
      <HStack gap={3} align="center" justify="between" wrap="wrap">
        <HStack gap={2} align="end" wrap="wrap">
          <Text as="h2" size="lg" weight="bold">
            {title}
          </Text>
          {meta ? (
            <Text color="secondary" size="sm">
              {meta}
            </Text>
          ) : null}
        </HStack>
        {action}
      </HStack>
      {children}
    </VStack>
  );
}

/** 숫자 카드: 작은 이름 · 큰 숫자(+ 단위) · 오른쪽 위 증감 · 오른쪽 아래 작은 그림 */
export function Stat({ label, value, unit, badge, extra, hint }: { label: string; value: ReactNode; unit?: string; badge?: ReactNode; extra?: ReactNode; hint?: ReactNode }) {
  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack justify="between" align="center" gap={2} minHeight={24}>
          <Text color="secondary" size="sm">
            {label}
          </Text>
          {badge}
        </HStack>
        <HStack justify="between" align="end" gap={3}>
          <Text size="3xl" weight="bold" hasTabularNumbers>
            {value}
            {unit ? (
              <Text color="secondary" size="sm" weight="normal">
                {` ${unit}`}
              </Text>
            ) : null}
          </Text>
          {extra}
        </HStack>
        {hint ? (
          <Text color="secondary" size="xsm">
            {hint}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}

/** 지표 띠: 세로 구분선으로 나뉜 값 여럿(드로어 · 이슈 머리). 첫 값은 강조색. */
export function StatStrip({ items }: { items: Array<{ label: string; value: ReactNode; unit?: string }> }) {
  return (
    <HStack gap={4} wrap="wrap" align="stretch">
      {items.map((it, i) => (
        <HStack key={it.label} gap={4} align="stretch">
          {i > 0 ? <Divider orientation="vertical" /> : null}
          <VStack gap={1}>
            <Text color="secondary" size="xsm">
              {it.label}
            </Text>
            <Text size="xl" weight="bold" {...(i === 0 ? { color: "accent" as const } : {})} hasTabularNumbers>
              {it.value}
              {it.unit ? (
                <Text color="secondary" size="xsm" weight="normal">
                  {` ${it.unit}`}
                </Text>
              ) : null}
            </Text>
          </VStack>
        </HStack>
      ))}
    </HStack>
  );
}

/** 넓으면 본문 2 : 곁 1 두 칸, 좁으면 한 칸으로 쌓는다(가로 스크롤 없음) */
export function TwoCol({ main, side, wide = 1100 }: { main: ReactNode; side: ReactNode; wide?: number }) {
  const isWide = useMediaQuery(`(min-width: ${wide}px)`);
  if (!isWide) {
    return (
      <VStack gap={5}>
        {main}
        {side}
      </VStack>
    );
  }
  return (
    <Grid columns={3} gap={5} align="start">
      <GridSpan columns={2}>
        <VStack gap={5}>{main}</VStack>
      </GridSpan>
      <VStack gap={5}>{side}</VStack>
    </Grid>
  );
}
