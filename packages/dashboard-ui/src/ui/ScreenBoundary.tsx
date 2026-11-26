// 화면 하나가 그리다 터져도 왼쪽 메뉴와 다른 화면은 살아 있게 한다. 이 경계가 없으면 React 가 앱 전체를 지워 흰 화면이 된다.
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Ico } from "./common";
import { Page } from "./Page";

interface Props {
  /** 이 값이 바뀌면(다른 화면으로 옮기면) 오류 상태를 비운다 */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  key: string;
}

export class ScreenBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 화면에는 짧은 글만 보이고, 고칠 사람이 볼 자세한 내용은 개발자 도구에 남긴다
    console.error("[knots-sync 관리 페이지] 화면을 그리지 못했습니다", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <Page title="화면을 그리지 못했습니다" search={false}>
        <EmptyState
          title="이 화면을 그리지 못했습니다"
          description={`다른 화면은 그대로 씁니다. 이 화면의 문제는 킷 버그입니다 — 아래 글과 함께 알려 주세요. (${this.state.error.message})`}
          icon={<Ico name="alert" size={24} />}
          actions={<Button label="다시 불러오기" icon={<Ico name="refresh" />} onClick={() => location.reload()} />}
        />
      </Page>
    );
  }
}
