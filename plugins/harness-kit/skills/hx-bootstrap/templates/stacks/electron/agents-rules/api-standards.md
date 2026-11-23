<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Electron 데스크톱 · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# IPC 계약 · API 연동 표준 — {{PROJECT_NAME}}

이 앱에는 두 종류의 경계가 있다. **IPC**(renderer ↔ main)와 **외부 API**(main → 서버).
둘 다 신뢰 경계이며 같은 원칙을 따른다 — 경계에서 파싱하고, 에러를 매핑하고, 취소를 지원한다.

## 1. IPC 채널 규약

### 채널 이름

- 형식은 `<도메인>:<동작>` 으로 고정한다: `{{DOMAIN_EXAMPLE}}:list` · `{{DOMAIN_EXAMPLE}}:create` · `app:check-update`.
- **채널 상수를 한 파일에 모은다**(`shared/channels.ts`). 문자열 리터럴을 양쪽에 흩지 않는다.
  흩는 순간 오타가 런타임 무응답이 되고, 이름을 바꿀 때 한쪽이 남는다.
- 채널을 지울 때는 preload·main·렌더러 호출부·문서 네 곳을 함께 지운다.

### `invoke`/`handle`이 기본이다

| 방향 | 수단 | 언제 |
|---|---|---|
| renderer → main, 응답 필요 | `invoke` / `handle` | **기본값.** 요청-응답 짝이 언어 차원에서 맞는다 |
| main → renderer, 통지 | `webContents.send` + 렌더러 구독 | 진행률·외부 이벤트·상태 변경 알림 |
| renderer → main, 응답 불필요 | `send` / `on` | 드물다. 대개 `invoke`가 낫다 |

- `send`로 요청하고 다른 채널로 응답을 받는 구조를 만들지 않는다. 짝이 어긋나고 취소가 불가능해진다.
- 동기 IPC(`sendSync`)를 쓰지 않는다. 렌더러가 멈춘다.

### 계약 정의

```ts
// shared/{{DOMAIN_EXAMPLE}}/contract.ts — 타입과 채널 상수만. 런타임 Node API 금지.
export const {{DOMAIN_EXAMPLE}}Channels = {
  list: '{{DOMAIN_EXAMPLE}}:list',
  create: '{{DOMAIN_EXAMPLE}}:create',
} as const;

export type ListRequest = { readonly cursor?: string; readonly limit: number };
export type ListResponse = { readonly items: readonly Item[]; readonly nextCursor?: string };
```

- `shared/`에는 **타입과 상수만** 둔다. 렌더러가 함께 import하므로 Node API가 들어가면 번들이 깨진다.
- 요청·응답 스키마를 파서로 정의하고 **타입은 거기서 유도**한다. 타입과 파서가 갈라지면 파싱이 무의미해진다.
- 주고받는 값은 **구조화 복제가 가능한 것**이어야 한다. 함수·클래스 인스턴스·`Symbol`은 넘어가지 않는다.

### main 핸들러 규약

- **인자를 스키마로 파싱한 뒤 쓴다.** 렌더러는 신뢰 경계 밖이다([`security.md`](./security.md)).
- 핸들러 등록은 **한 곳에서 한 번만.** 중복 `handle`은 예외를 던지고, 핫 리로드에서 자주 발생한다.
- 핸들러는 얇게: 파싱 → 권한/정책 확인 → 서비스 호출 → 응답 변환. 비즈니스 로직을 핸들러에 인라인하지 않는다.
- **오래 걸리는 작업은 핸들러 안에서 동기로 돌리지 않는다.** main이 멈추면 모든 창이 멈춘다.
  워커·자식 프로세스로 보내고 진행률은 이벤트로 통지한다.
- 어느 창이 불렀는지 알아야 하는 동작은 `event.sender`로 확인한다. 창마다 권한이 다르면 여기서 판정한다.

### 오류 형태

IPC를 넘어가면 Error 객체의 타입·스택이 그대로 보존되지 않는다. **형태를 정해 두지 않으면 렌더러가
`[object Object]`를 표시하게 된다.**

```ts
export type IpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: IpcErrorCode; readonly message: string };
```

- 오류는 **기계 판독 가능한 `code`**와 **사용자 노출용 `message`**를 함께 담는다.
- 내부 오류 메시지·스택·파일 경로를 `message`에 넣지 않는다. 상세는 main 로그에만.
- 코드 카탈로그(예시 — 프로젝트에서 확정):

| code | 의미 | 렌더러 처리 |
|---|---|---|
| `INVALID_INPUT` | 스키마 파싱 실패 | 폼 오류로 되돌린다 |
| `NOT_FOUND` | 대상 없음 | "없음" 화면 |
| `FORBIDDEN` | 정책상 거부 | 안내. 재시도 버튼 없음 |
| `CONFLICT` | 상태 충돌 | 최신 상태 다시 읽기 |
| `IO_ERROR` | 파일·저장소 실패 | 재시도 가능 에러 |
| `NETWORK_ERROR` | 외부 호출 실패 | 재시도 가능 에러 |
| `INTERNAL` | 그 외 | 재시도 + 문의 경로 |

- 코드는 한번 부여하면 재사용·변경하지 않는다.

### 취소 · 진행률

- 오래 걸리는 작업은 **작업 ID**를 발급하고 `<도메인>:cancel` 채널로 취소를 받는다.
- 진행률은 `webContents.send`로 통지하되 **빈도에 상한**을 둔다(프레임마다 보내면 IPC가 병목이 된다).
- 창이 닫히면 그 창을 위한 작업을 취소한다. `webContents`가 파괴된 뒤 `send`하면 예외가 난다 —
  전송 전에 살아 있는지 확인한다.

### 렌더러 쪽 규약

- 컴포넌트에서 `window.<api>`를 직접 부르지 않는다. **데이터 접근 계층**(훅·클라이언트)을 경유한다.
- 응답은 스키마로 파싱한다. preload를 지나온 값도 타입 주장일 뿐이다.
- 구독(`on`)은 언마운트에서 반드시 해제한다. 해제하지 않으면 창 수명 동안 누적된다.
- 상태 종류는 [`ui-state.md`](./ui-state.md)를 따른다. main이 소유한 데이터는 "서버 상태"로 다룬다.

## 2. 외부 API 연동 (main에서)

- **외부 호출은 main에서** 한다. 자격증명이 렌더러로 내려가지 않는다.
- 모든 요청에 타임아웃. 재시도는 멱등한 요청만, 지수 백오프 + 지터. 4xx는 재시도하지 않는다.
- 응답은 스키마로 파싱해 좁힌 뒤 도메인 모델로 변환한다.
- 오프라인·프록시·사설 인증서 환경을 가정한다. **데스크톱 앱은 통제되지 않은 네트워크에서 돈다.**
  프록시 설정과 인증서 오류를 사용자에게 설명 가능한 형태로 보여 준다.
- 외부 API 오류는 위 `IpcErrorCode`로 매핑해 렌더러에 전달한다. 원문을 그대로 노출하지 않는다.
- 상세 원칙은 [`reliability.md`](./reliability.md).

## 3. 로컬 저장소 접근

- 파일·DB 접근은 main에서만. 경로는 OS 표준 앱 데이터 경로 API로 얻는다.
- 쓰기는 **원자적으로**: 임시 파일에 쓰고 이름을 바꾼다. 중간에 앱이 죽어도 파일이 깨지지 않는다.
- 스키마 버전을 파일에 함께 저장하고 마이그레이션 경로를 만든다. 구버전 데이터로 앱이 시작되지 않는 상황을 막는다.
- 큰 데이터를 IPC로 통째 넘기지 않는다. 페이지네이션하거나 경로를 넘긴다([`frontend-performance.md`](./frontend-performance.md)).

## 4. 연동 DoD (Story)

- [ ] 채널 상수가 `shared/`에 있고 문자열 리터럴이 흩어져 있지 않다.
- [ ] main 핸들러가 인자를 스키마로 파싱하고, 파싱 실패가 `INVALID_INPUT`으로 반환된다.
- [ ] preload가 **동작 단위**로 좁게 노출한다(채널 이름을 인자로 받지 않는다).
- [ ] 오류가 `{ ok, code, message }` 형태로 오고 렌더러가 코드별로 분기한다.
- [ ] 내부 메시지·스택·경로가 렌더러로 넘어가지 않는다.
- [ ] 오래 걸리는 작업에 취소·진행률이 있고, 창 종료 시 정리된다.
- [ ] 렌더러 구독이 언마운트에서 해제된다.
- [ ] 성공 + 최소 1개 실패 케이스 테스트(핸들러 단위).
- [ ] 채널 계약 문서가 같은 변경에 갱신됐다([`guardrails.md`](./guardrails.md) "docs 동시 갱신").
