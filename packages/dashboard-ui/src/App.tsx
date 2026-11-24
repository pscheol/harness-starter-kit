// 관리 페이지 틀: 모드(단일 리포 · 전체 프로젝트 · 프로젝트 안)를 정하고, 왼쪽 레일(AppShell + SideNav) 옆에 화면을 늘 같은 틀(Page)로 건다.
import { AppShell } from "@astryxdesign/core/AppShell";
import { Card } from "@astryxdesign/core/Card";
import { LinkProvider } from "@astryxdesign/core/Link";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { projectId } from "./lib/api";
import { menuOf, pct, type Route } from "./lib/format";
import { AppAnchor, useRoute } from "./lib/router";
import { badges, detectMode, getState, loadProjects, loadSession, refreshOverview, refreshUsageNow, setState, startPolling, stopPolling, useAppState } from "./lib/store";
import { Ico, Loading, ErrorBlock, Muted } from "./ui/common";
import { DispatchProvider } from "./ui/Dispatch";
import { Page } from "./ui/Page";
import { PinProvider } from "./ui/Pin";
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
      { id: "ops", path: "/ops", label: "운영", icon: "ops" },
      { id: "usage", path: "/usage", label: "기록 · 사용량", icon: "chart" },
    ],
  },
];

function Rail({ route }: { route: Route }) {
  const app = useAppState();
  const multi = app.mode === "multi-root";
  const current = menuOf(route);
  const b = badges(app.overview);
  const s = app.session;
  const usage = app.usageNow?.enabled ? app.usageNow.session : null;
  return (
    <SideNav
      aria-label="주 메뉴"
      header={<SideNavHeading heading="harnessync" subheading={multi ? "전체 프로젝트" : (s?.repo ?? "…")} icon={<Ico name="harness" size={20} />} />}
      footer={
        <VStack gap={2} padding={2}>
          {!multi ? (
            <Card padding={3}>
              <VStack gap={2}>
                <HStack justify="between" align="end" gap={2}>
                  <Text size="xsm" weight="semibold">
                    지금 세션 컨텍스트
                  </Text>
                  <Text size="xsm" color="secondary" hasTabularNumbers>
                    {usage && usage.ratio !== null ? pct(usage.ratio) : "기록 없음"}
                  </Text>
                </HStack>
                <ProgressBar label="지금 세션 컨텍스트 사용률" isLabelHidden value={usage && usage.ratio !== null ? Math.round(usage.ratio * 100) : 0} variant={usage?.warn ? "warning" : "accent"} />
                <Text size="xsm" color="secondary">
                  {app.usageNow && !app.usageNow.enabled ? "대화 기록 읽기가 꺼져 있다" : usage?.warn ? "자동 압축이 가깝다" : "기록 · 사용량에서 자세히"}
                </Text>
              </VStack>
            </Card>
          ) : null}
          <HStack gap={1} align="center">
            <Ico name={s?.readOnly ? "eye" : "lock"} size={14} />
            <Text size="xsm" color="secondary" type="code">{`127.0.0.1:${location.port}`}</Text>
          </HStack>
          <Text size="xsm" color="secondary">
            {s?.readOnly ? "읽기 전용(에이전트 세션이거나 --read-only)" : app.loadError?.code === "unauthorized" ? "접속 토큰 확인 필요" : "접속 토큰 확인됨"}
          </Text>
        </VStack>
      }
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
      <Page title="관리 페이지" sub="연결하지 못했다" search={false}>
        <ErrorBlock error={app.loadError} retry={() => location.reload()} />
      </Page>
    );
  }
  const key = app.mode === "multi-root" ? "projects" : route.name;
  const View = VIEWS[key];
  if (!View) {
    return (
      <Page title="찾을 수 없다">
        <Muted>{`${route.params.path ?? ""} 는 관리 페이지의 화면이 아니다.`}</Muted>
      </Page>
    );
  }
  return (
    <Suspense
      fallback={
        <Page title="불러오는 중…" search={false}>
          <Loading rows={6} />
        </Page>
      }
    >
      <View key={`${key}:${route.params.key ?? ""}:${route.params.target ?? ""}`} route={route} />
    </Suspense>
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
          <AppShell sideNav={<Rail route={route} />} height="fill" contentPadding={0}>
            {app.loadError && app.ready && app.session ? (
              <Page title="연결이 끊겼다" sub="서버를 연 터미널이 켜져 있는지 본다" search={false}>
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
