<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · Kotlin/Java + Spring · 아키텍처: multimodule · 플레이스홀더({{PROJECT_NAME}}·{{PROJECT_SLUG}}·{{PACKAGE_NS}}·{{DOMAIN_EXAMPLE}}) 치환 후 사용 -->

# 구조 · Gradle 멀티모듈 — {{PROJECT_NAME}}

이 프로젝트는 Gradle 멀티모듈이다. 킷이 강제하는 것은 모듈 등급 간 의존 방향 하나이고,
모듈을 무엇으로 자를지·어떻게 이름 붙일지는 프로젝트가 정한다. 의존 방향 위반은 **컴파일 실패**로 막힌다.
아키텍처 상세 원본은 `ARCHITECTURE.md`.

> `hexagonal`도 멀티모듈이다. 차이는 **규격의 강도** — `hexagonal`은 컨텍스트당 4모듈 고정 규격,
> `multimodule`은 분할 축을 프로젝트가 고르고 등급 간 방향만 강제한다.

이 문서의 `<module>`·`<shared>`·`<runtime>`은 자리표시자다. 실제 이름은 아래 표를 채워 확정한다.

## 1. 모듈 등급 (이름이 아니라 등급이 규칙을 정한다)

| 등급 | 역할 | 개수 | 의존 가능 |
|---|---|---|---|
| 실행(runtime) | `@SpringBootApplication`·조립·설정·실행. `bootJar` 산출 | 1 | 구성 · 공유 (전부) |
| 구성(component) | 도메인·어댑터·기술 관심사 — 분할 결과 | N | 공유만 |
| **공유(shared)** | 계약 인터페이스·공용 모델·envelope·ErrorCode·예외 | 0~2 | 없음(프레임워크 최소) |

**의존 금지(컴파일 차단)**: `구성 → 실행` · `공유 → 구성/실행` · `구성 A ↔ 구성 B`(§3 예외 제외).

> **이 프로젝트의 모듈 등급표** — 모듈을 추가할 때마다 여기에 등록한다.
>
> | 모듈 | 등급 | 역할 | 의존 |
> |---|---|---|---|
> | `<runtime>` | 실행 | 부팅·조립·웹 경계 | 전부 |
> | `<module-a>` | 구성 | (역할) | `<shared>` |
> | `<shared>` | 공유 | 계약·공용 모델 | — |

- 공유 모듈에 Spring Web·JPA·벤더 SDK를 부착하지 않는다. 여기에 넣은 의존은 모든 모듈이 끌고 간다 — 격리 목적이 사라진다.
- 공유 모듈을 늘리지 않는다. "둘 다 쓰니까 공유로"를 반복하면 공유 모듈이 곧 전체가 된다. 둘만 쓰는 것은 **한쪽이 소유하고 계약으로 노출**한다.
- 실행 모듈에는 **조립과 설정만**. 비즈니스 로직이 여기 쌓이면 모듈 분할이 무의미해진다.

## 2. 분할 축과 네이밍 (프로젝트가 정하고 기록)

**모듈을 무엇으로 자를 것인가** — 하나만 고를 필요는 없고, 섞어도 된다.

| 분할 축 | 언제 | 모듈 예시 |
|---|---|---|
| 도메인 | 서로 다른 업무 영역이 한 배포 단위에 산다 | `{{DOMAIN_EXAMPLE}}` · `user` · `notification` |
| 연동 대상 | 같은 역할의 외부 시스템이 여럿이거나 SDK가 무겁다 | `<vendor-a>` · `<vendor-b>` |
| 기술 관심사 | 영속·배치·메시징 등 스택이 다른 덩어리가 있다 | `jpa` · `batch` · `messaging` |
| 공개 표면 | 웹 API와 관리자/내부 API의 노출 경계가 다르다 | `api` · `admin` |

네이밍은 **한 규약을 정해 일관되게** 쓰기만 하면 된다.

```
# 예시 A — 접두사만 통일 (가장 흔함)
:{{PROJECT_SLUG}}-api       :{{PROJECT_SLUG}}-{{DOMAIN_EXAMPLE}}   :{{PROJECT_SLUG}}-jpa      :{{PROJECT_SLUG}}-common

# 예시 B — 역할을 접미사로 구분
:{{PROJECT_SLUG}}-bootstrap :{{PROJECT_SLUG}}-<vendor>-client      :{{PROJECT_SLUG}}-storage  :{{PROJECT_SLUG}}-contract

# 예시 C — 접두사 없이 짧게 (모듈 수가 적을 때)
:app                        :{{DOMAIN_EXAMPLE}}                     :persistence               :core
```

> **채택한 분할 축·네이밍 규약**: `(여기에 적는다)`

- `client`·`adapter` 같은 단어를 의무적으로 붙이지 않는다. 뜻이 분명해질 때만 붙인다.
- 모듈을 만들 이유가 "폴더가 커서"라면 만들지 않는다. 모듈은 **의존을 끊고 싶을 때** 만든다. 애매하면 적게 자른다.
- `common2`·`util`·`core-new` 같은 이름은 분할 축이 없다는 신호다.

## 3. 구성 모듈 간 의존 (기본 금지 · 예외는 기록)

구성 모듈이 서로를 필요로 하면 분할 축이 틀렸을 가능성을 먼저 의심한다. 그래도 필요하면:

| 방법 | 언제 | 대가 |
|---|---|---|
| (a) 계약을 공유 등급으로 올린다 | 양쪽이 대등하게 쓰는 개념 | 공유 모듈이 커진다 |
| (b) **실행 모듈이 조립**한다(계약 주입) | 한쪽이 다른 쪽 결과를 쓰는 정도 | 실행 모듈이 배선을 안다 |
| (c) **직접 의존을 선언적으로 허용** | 명백한 상하 관계 | 순환 위험·분리 비용 |

(c)를 고르면 **아래 표에 기록**한다. 기록되지 않은 간선은 리뷰에서 되돌린다. 순환은 절대 금지.
의존하는 쪽은 상대의 **공개 계약 타입만** 참조한다(엔티티·DTO·내부 구현 참조 금지).

> **허용된 구성 모듈 간 의존** (없으면 "없음"으로 유지)
>
> | from | to | 이유 | 승인일 |
> |---|---|---|---|
> | — | — | — | — |

## 4. 모듈 공개 표면 (밖으로 나가는 것 / 갇히는 것)

| 모듈 안에 갇히는 것 | 모듈 밖으로 나가는 것 |
|---|---|
| JPA 엔티티 · 영속 매핑 | 공유 모듈의 공용 모델 / 값 객체 |
| 외부 SDK 타입 · 벤더 응답 DTO · 인증 자격증명 | 공개 계약 인터페이스의 구현 빈 |
| 내부 매퍼 · 내부 설정(`@ConfigurationProperties`) | 공유 모듈의 `ErrorCode`로 변환된 예외 |
| 모듈 전용 상수 · 내부 헬퍼 | (그 외 없음) |

- 변환은 소유 모듈 안에서 끝낸다. 다른 모듈에 `<Vendor>ToDomainMapper`·`<Entity>ToDto`가 생기면 경계가 잘못 그어진 것이다.
- JPA 엔티티를 모듈 밖(컨트롤러·다른 모듈·응답)에 노출하지 않는다. 영속 모델 변경이 곧 API 변경이 된다.
- 외부 시스템의 HTTP 에러·타임아웃은 소유 모듈에서 공유 모듈의 예외 타입으로 변환해 던진다.

## 5. 패키지 컨벤션

```
{{PACKAGE_NS}}
├── <shared>            ← 공유 등급. 프레임워크 무의존. 계약·공용 모델·envelope·ErrorCode
├── <module-a>          ← 구성 등급. 모듈 하나 = 패키지 하나 (1:1)
├── <module-b>
└── (실행 모듈)          ← Application · 조립 설정 · GlobalExceptionHandler
```

- 패키지는 모듈과 1:1로 맞춘다. 이러면 구조 테스트가 패키지만 보고 모듈 경계를 검사할 수 있다.
- 모듈 안쪽 구조는 모듈마다 달라도 된다. 도메인 모듈(`service`/`domain`/`repository`)과 어댑터 모듈(`client`/`dto`/`mapper`/`config`)이 같은 내부 구조를 가질 이유가 없다. 다만 **한 모듈 안에서는 일관**되게 한다.
- 클래스명은 도메인 개념으로 짓고 테이블 prefix를 붙이지 않는다(`TbOrder` ✗ → `Order` + `@Table(name = "tb_order")` ○). 네임스페이스는 패키지가 담당한다.
- **인터페이스 + `*Impl` 한 쌍을 관성으로 만들지 않는다. 구현이 하나뿐이면 클래스만 둔다. 계약 인터페이스는 다른 모듈이 봐야 하거나 구현이 실제로 여럿일 때** 존재 이유가 있다.

## 6. 레이어 규약

- 트랜잭션 경계는 유스케이스 서비스에만. 리포지토리·영속 어댑터·엔티티에 `@Transactional` 금지 — 엔티티 메서드의 `@Transactional`은 프록시 대상이 아니라 아무 효과가 없다.
- 외부 호출을 트랜잭션 안에 넣지 않는다(응답 3초 = DB 커넥션 3초 점유).
- **집계·카운터는 DB의 원자적 연산으로**. read-modify-write와 JVM 락(`synchronized`/`ReentrantLock`)은 인스턴스 2대에서 갱신 손실이 난다.
- **생성자 주입 only**. `@Value`·`@Autowired` 필드 주입 금지 — 설정은 `@ConfigurationProperties`로 받아 생성자로 넘긴다.
- 파싱·검증은 인바운드 경계에서. 안쪽 계층이 원시 문자열·맵을 다시 검증하지 않는다.
- 자격증명·토큰·인증 헤더는 로그 금지. 예외는 공유 모듈의 도메인 예외로 올리고 응답 변환은 `GlobalExceptionHandler` 한 곳.
- AOP 부가 기능의 실패가 주기능을 죽이지 않게 한다(수집 실패 → 주 응답 500 금지).

## 7. 조립 규약

- 구현 빈 배선은 **실행 모듈**에서 한다. 구성 모듈이 다른 구성 모듈의 빈을 직접 찾지 않는다.
- 라이브러리 모듈의 `@Configuration`은 실행 모듈의 컴포넌트 스캔 범위 밖이다. `@AutoConfiguration` + `META-INF/spring/…AutoConfiguration.imports` 로 자기 설정을 스스로 등록하거나 실행 모듈이 명시적으로 `@Import` 한다.
- 실행 모듈에서 `@ComponentScan(basePackages = "…다른 모듈 내부…")` 로 남의 패키지를 긁지 않는다 — 모듈이 자기 설정의 주인이 아니게 되고, 모듈을 추가할 때마다 실행 모듈을 고쳐야 한다.

## 8. 새 모듈 착수 워크플로

1. 정말 모듈이어야 하는지 답한다. 끊고 싶은 의존이 무엇인가? 답이 없으면 기존 모듈의 패키지로 만든다.
2. 등급을 정한다(§1) — 구성 등급이 기본. 공유 등급은 신중하게.
3. `settings.gradle`에 등록 → 모듈 빌드 스크립트 작성. **의존은 등급 규칙대로**(구성은 공유만).
4. 필요한 라이브러리를 `gradle/libs.versions.toml`에 추가하고 **카탈로그 별칭으로만** 참조한다([`tech.md`](./tech.md)).
5. 패키지를 `{{PACKAGE_NS}}.<module>`로 만들고, §1 등급표와 §9 구조 테스트에 이 모듈을 등록한다.
6. `scripts/verify.sh`(= `./gradlew check`) — 의존 방향과 누출이 잡히는지 확인.

## 9. 구조 테스트 (모듈 그래프가 못 잡는 것)

모듈 그래프는 모듈 간 의존을 막지만, **모듈 안에서의 타입 누출**은 못 잡는다.
**실행 모듈의 테스트 소스셋**(모든 모듈이 클래스패스에 올라오는 유일한 지점)에 둔다.

```java
package {{PACKAGE_NS}}.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

class ModuleBoundaryTest {

    private final JavaClasses all = new ClassFileImporter().importPackages("{{PACKAGE_NS}}");

    @Test
    void JPA_엔티티는_소유_모듈_밖으로_나가지_않는다() {
        noClasses().that().resideOutsideOfPackage("{{PACKAGE_NS}}.<persistence-module>..")
            .should().dependOnClassesThat().areAnnotatedWith("jakarta.persistence.Entity")
            .check(all);
    }

    @Test
    void 외부_SDK_타입은_소유_모듈_밖으로_나가지_않는다() {
        // 벤더 SDK 패키지를 프로젝트에 맞게 채운다. 외부 연동이 없으면 이 테스트는 지운다.
        noClasses().that().resideOutsideOfPackage("{{PACKAGE_NS}}.<vendor-module>..")
            .should().dependOnClassesThat().resideInAnyPackage("<vendor.sdk.package>..")
            .check(all);
    }

    @Test
    void 공유_모듈은_프레임워크를_모른다() {
        noClasses().that().resideInAPackage("{{PACKAGE_NS}}.<shared>..")
            .should().dependOnClassesThat()
            .resideInAnyPackage("org.springframework.web..", "jakarta.persistence..")
            .check(all);
    }

    @Test
    void 모듈_간_순환이_없다() {
        slices().matching("{{PACKAGE_NS}}.(*)..").should().beFreeOfCycles().check(all);
    }
}
```

- 자리표시자를 프로젝트 모듈 이름으로 채워야 작동한다. `<persistence-module>`·`<vendor-module>`·`<shared>`를 그대로 두면 아무것도 검사하지 않는다.
- 규칙이 0개 클래스를 검사하면 실패로 취급한다. ArchUnit 1.x는 `archRule.failOnEmptyShould` 기본값이 `true`다 — 자리표시자 미치환·패키지명 오타로 규칙이 조용히 죽는 것을 잡는 자동 감지이므로 `archunit.properties`에서 끄지 않는다.
- 해당 없는 규칙은 **주석 처리가 아니라 삭제**한다. 죽은 규칙은 "검사하고 있다"는 착각만 남긴다.
- Kotlin이면 **Konsist**로 같은 규칙을 표현해도 된다. 핵심은 위반을 `./gradlew check`에서 실패로 만드는 것이다.
- 규칙을 `@Disabled`로 끄는 것 = 경계를 없애는 것이다. 규칙이 틀렸다면 ADR을 남기고 경계를 다시 긋는다.

## 10. (선택) 같은 역할의 구현이 여럿일 때

동일 계약의 구현이 둘 이상이고 **런타임에 골라야 할 때만** 본다. 구현이 하나뿐이면 건너뛴다.

- 계약과 식별자 enum은 **공유 등급**에, 구현은 각 소유 모듈에.
- 레지스트리 키는 구현이 스스로 선언한다(`Provider provider();`). 빈 이름 문자열 매칭(`beanName.contains(...)`)·클래스명 규약으로 찾지 않는다 — 이름을 바꾸면 **컴파일러가 아무 말 없이** 라우팅이 깨진다.
- 레지스트리는 **생성자로 `List<계약>`을 받아 불변 맵**으로 확정한다. `static`/가변 맵을 `@PostConstruct`로 채우지 않는다.
- 폴백을 둔다면: 회복 가능 예외만 잡고(`catch (Exception)` 금지), 4xx는 즉시 올리고, 순서는 설정에서 오고, 어느 구현이 응답했는지 결과에 남기고, 전부 실패하면 마지막 실패를 `cause`로 단다.
- 상세·코드 골격은 `ARCHITECTURE.md` §4.3.

## 11. 새 기능 착수 규칙

1. 새 기능은 **한 모듈 안에서** 구현한다. 두 구성 모듈을 동시에 고쳐야 한다면 경계가 맞는지 먼저 의심한다.
2. 기존 패턴이 있으면 따른다(컨벤션 우선).
3. API 변경은 `.agents/docs/openapi`를 함께 갱신한다.
4. 모듈이 사실상 하나로 수렴하면 `layered`로 후퇴, 한 모듈의 도메인 규칙이 지배적이면 `hexagonal` 승격을 검토한다(`ARCHITECTURE.md` §0·§12).

> `{{DOMAIN_EXAMPLE}}`는 실제 도메인으로, `<module>`·`<shared>`·`<runtime>`·`<vendor>`는 채택한 모듈명으로 치환한다.
> 설치기는 토큰을 그대로 갈아 끼우므로 타입명 자리는 PascalCase로 손본다(패키지·설정 키·모듈명은 소문자 그대로).
