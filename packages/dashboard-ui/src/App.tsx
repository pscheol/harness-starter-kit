// 관리 페이지 틀: 모드(단일 리포 · 전체 프로젝트 · 프로젝트 안)를 정하고, 왼쪽 레일(AppShell + SideNav) 옆에 화면을 늘 같은 틀(Page)로 건다.
import { AppShell } from "@astryxdesign/core/AppShell";
import { Card } from "@astryxdesign/core/Card";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Link, LinkProvider } from "@astryxdesign/core/Link";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { projectId } from "./lib/api";
import { menuOf, pct, type Route } from "./lib/format";
import { AppAnchor, useRoute } from "./lib/router";
import { badges, detectMode, getState, loadProjects, loadSession, refreshOverview, refreshUsageNow, setState, startPolling, stopPolling, useAppState } from "./lib/store";
import { Ico, Loading, ErrorBlock, Muted, TermHelp } from "./ui/common";
import { DispatchProvider } from "./ui/Dispatch";
import { Page } from "./ui/Page";
import { PinProvider } from "./ui/Pin";
import { ScreenBoundary } from "./ui/ScreenBoundary";
import type { IconName } from "./ui/icons";
import type { Loose } from "./lib/types";

type View = ComponentType<{ route: Route }>;
const lazyView = (load: () => Promise<{ default: View }>): View => lazy(load) as unknown as View;

const VIEWS: Record<string, View> = {
  home: lazyView(() => import("./views/Home")),
  projects: lazyView(() => import("./views/Projects")),
  progress: lazyView(() => import("./views/Progress")),
  intent: lazyView(() => import("./views/Progress")),
  flow: lazyView(() => import("./views/Flow")),
  issue: lazyView(() => import("./views/Issue")),
  docs: lazyView(() => import("./views/Docs")),
  questions: lazyView(() => import("./views/Questions")),
  verify: lazyView(() => import("./views/Verify")),
  workspace: lazyView(() => import("./views/Workspace")),
  skills: lazyView(() => import("./views/Skills")),
  harness: lazyView(() => import("./views/Harness")),
  ops: lazyView(() => import("./views/Ops")),
  intake: lazyView(() => import("./views/Intake")),
  usage: lazyView(() => import("./views/Usage")),
};

interface NavDef {
  id: string;
  path: string;
  label: string;
  icon: IconName;
}
const NAV_GROUPS: Array<{ title: string; items: NavDef[] }> = [
  {
    title: "작업",
    items: [
      { id: "home", path: "/", label: "홈", icon: "home" },
      { id: "progress", path: "/progress", label: "진행", icon: "board" },
      { id: "docs", path: "/docs", label: "문서", icon: "doc" },
      { id: "intake", path: "/intake", label: "새 요구사항", icon: "plus" },
    ],
  },
  {
    title: "품질",
    items: [
      { id: "verify", path: "/verify", label: "검증", icon: "shield" },
      { id: "harness", path: "/harness", label: "하네스", icon: "harness" },
      { id: "skills", path: "/skills", label: "스킬", icon: "skills" },
    ],
  },
  {
    title: "운영",
    items: [
      { id: "workspace", path: "/workspace", label: "작업 공간", icon: "worktree" },
      { id: "ops", path: "/ops", label: "배포 · 운영 기록", icon: "ops" },
      { id: "usage", path: "/usage", label: "기록 · 사용량", icon: "chart" },
    ],
  },
];

/** 왼쪽 아래: 지금 세션 컨텍스트(대화 기록에서 읽은 비율)와 접속 상태. 글은 늘 무엇인지 · 무엇을 하면 되는지를 말한다. */
function SessionCard() {
  const app = useAppState();
  const now = app.usageNow;
  const usage = now?.enabled ? now.session : null;
  const off = now !== null && now !== undefined && !now.enabled;
  const value = off ? "꺼짐" : usage && usage.ratio !== null ? pct(usage.ratio) : "—";
  let line = "기록 · 사용량에서 자세히 봅니다";
  if (off) line = "대화 기록 읽기를 꺼 두었습니다";
  else if (now && !usage) line = "이 리포에서 연 세션이 아직 없습니다";
  else if (usage?.warn) line = "곧 자동 압축됩니다 — 큰 작업은 새 세션에서";
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack justify="between" align="center" gap={2}>
          <HStack gap={0.5} align="center">
            <Text size="sm" weight="semibold">
              세션 컨텍스트
            </Text>
            <IconButton label="세션 컨텍스트 풀이" tooltip="지금 AI 세션이 한 번에 담을 수 있는 양 중 쓴 비율입니다. 100%에 가까우면 하네스가 앞 대화를 줄여(자동 압축) 담습니다." icon={<Ico name="help" size={14} />} variant="ghost" size="sm" />
          </HStack>
          <Text size="sm" weight="semibold" hasTabularNumbers>
            {value}
          </Text>
        </HStack>
        <ProgressBar label="지금 세션 컨텍스트 사용률" isLabelHidden value={usage && usage.ratio !== null ? Math.round(usage.ratio * 100) : 0} variant={usage?.warn ? "warning" : "accent"} />
        <Link href="/usage" size="sm">
          {line}
        </Link>
      </VStack>
    </Card>
  );
}

function RailFooter({ multi }: { multi: boolean }) {
  const app = useAppState();
  const s = app.session;
  let access = "접속 확인됨";
  if (s?.readOnly) access = "읽기 전용 화면";
  else if (app.loadError?.code === "unauthorized") access = "접속 토큰을 확인하지 못했습니다";
  return (
    <VStack gap={2} padding={2}>
      {multi ? null : <SessionCard />}
      <HStack gap={1} align="center" wrap="wrap">
        <Ico name={s?.readOnly ? "eye" : "lock"} size={14} />
        <Text size="sm" color="secondary">
          {access}
        </Text>
        {s?.readOnly ? <TermHelp term="readOnly" /> : null}
      </HStack>
      <Text size="sm" color="secondary" type="code">{`127.0.0.1:${location.port}`}</Text>
    </VStack>
  );
}

function Rail({ route }: { route: Route }) {
  const app = useAppState();
  const multi = app.mode === "multi-root";
  const current = menuOf(route);
  const b = badges(app.overview);
  const s = app.session;
  return (
    <SideNav
      aria-label="주 메뉴"
      header={<SideNavHeading heading="knots-sync" subheading={multi ? "전체 프로젝트" : (s?.repo ?? "…")} icon={<Ico name="harness" size={20} />} />}
      footer={<RailFooter multi={multi} />}
    >
      {!multi ? (
        NAV_GROUPS.map((g) => (
          <SideNavSection key={g.title} title={g.title}>
            {g.items.map((it) => {
              const badge = b[it.id];
              const Icon = <Ico name={it.icon} size={18} />;
              return (
                <SideNavItem
                  key={it.id}
                  label={it.label}
                  href={it.path}
                  icon={Icon}
                  isSelected={current === it.id}
                  {...(it.id === "intake" && s?.readOnly ? { isDisabled: true } : {})}
                  {...(badge && badge.n > 0 ? { endContent: <Badge variant={badge.kind === "decide" ? "red" : badge.kind === "warn" ? "yellow" : "neutral"} label={String(badge.n)} /> } : {})}
                />
              );
            })}
          </SideNavSection>
        ))
      ) : (
        <>
          <SideNavSection title="전체">
            <SideNavItem label="전체 프로젝트" href="/" icon={<Ico name="grid" size={18} />} isSelected={route.name === "home" || route.name === "projects"} />
          </SideNavSection>
          <SideNavSection title="프로젝트">
            {app.projects.map((p: Loose) =>
              p.state === "ok" ? (
                <SideNavItem key={p.id} label={p.name} href={`/p/${p.id}/`} icon={<Ico name="folder" size={18} />} isSelected={p.id === projectId()} />
              ) : (
                <SideNavItem key={p.id} label={p.name} icon={<Ico name="folder" size={18} />} isDisabled />
              ),
            )}
          </SideNavSection>
        </>
      )}
      {!multi && app.mode === "single" ? (
        <SideNavSection title="프로젝트">
          <SideNavItem label="전체 프로젝트 보기" href="/projects" icon={<Ico name="grid" size={18} />} isSelected={route.name === "projects"} />
        </SideNavSection>
      ) : null}
      {app.mode === "project" ? (
        <SideNavSection title="프로젝트">
          <SideNavItem label="전체 프로젝트로" href="/?hard=1" icon={<Ico name="grid" size={18} />} />
        </SideNavSection>
      ) : null}
    </SideNav>
  );
}

function Body({ route }: { route: Route }) {
  const app = useAppState();
  if (!app.ready) {
    return (
      <Page title="관리 페이지" sub="불러오는 중…" search={false}>
        <Loading rows={6} />
      </Page>
    );
  }
  if (app.loadError && !app.session && app.mode !== "multi-root") {
    return (
      <Page title="관리 페이지" sub="연결하지 못했습니다" search={false}>
        <ErrorBlock error={app.loadError} retry={() => location.reload()} />
      </Page>
    );
  }
  const key = app.mode === "multi-root" ? "projects" : route.name;
  const View = VIEWS[key];
  if (!View) {
    return (
      <Page title="찾을 수 없습니다">
        <Muted>{`${route.params.path ?? ""} 는 관리 페이지의 화면이 아닙니다.`}</Muted>
      </Page>
    );
  }
  const viewKey = `${key}:${route.params.key ?? ""}:${route.params.target ?? ""}`;
  return (
    <ScreenBoundary resetKey={viewKey}>
      <Suspense
        fallback={
          <Page title="불러오는 중…" search={false}>
            <Loading rows={6} />
          </Page>
        }
      >
        <View key={viewKey} route={route} />
      </Suspense>
    </ScreenBoundary>
  );
}

export function App() {
  const route = useRoute();
  const app = useAppState();
  useEffect(() => {
    let alive = true;
    void (async () => {
      await detectMode();
      if (!alive) return;
      const mode = getState().mode;
      if (mode === "multi-root") await loadProjects();
      else if (!(await loadSession())) {
        setState({ ready: true });
        return;
      }
      if (mode !== "multi-root") {
        if (mode === "project") await loadProjects();
        void refreshOverview();
        void refreshUsageNow();
        startPolling();
      }
      setState({ ready: true });
    })();
    return () => {
      alive = false;
      stopPolling();
    };
  }, []);
  return (
    <LinkProvider component={AppAnchor}>
      <PinProvider>
        <DispatchProvider>
          <AppShell sideNav={<Rail route={route} />} height="fill" contentPadding={0} variant="surface">
            {app.loadError && app.ready && app.session ? (
              <Page title="연결이 끊겼습니다" sub="서버를 연 터미널이 켜져 있는지 봅니다" search={false}>
                <ErrorBlock error={app.loadError} retry={() => void refreshOverview()} />
              </Page>
            ) : (
              <Body route={route} />
            )}
          </AppShell>
        </DispatchProvider>
      </PinProvider>
    </LinkProvider>
  );
}
