---
key: HK-10
area: install
type: fix
title: setup.sh의 층 겹침 순서와 치환값 특수 문자를 고친다
status: approved
created: 2026-11-23
---

# Requirements — HK-10 setup.sh 결함 2건

근거: HK-8 동일성 시험에서 확인한 차이(HK-8 design.md §10 D1 · D2), 설계 [02 §3.5 · §3.6](../../../../docs/design/02-cli-engine.md). v1.0.8에서도 같은 결함이다.

- **R10.1** 두 층이 같은 경로를 설치하면 뒤 층(common → domains → stacks → arch → optional 순서의 뒤)이 이긴다. 지금 setup.sh는 첫 설치에서 앞 층을 남기고, update는 뒤 층으로 바꿔 두 경로의 결과가 다르다.
- **R10.2** 치환값에 `&` · `|` · `\`가 있어도 그대로 들어간다(지금 sed 치환이 깨진다).
- **R10.3** setup.sh와 CLI(`layout.json`의 `overlap`, 치환 방식)를 같은 커밋에서 바꾸고, 동일성 시험 매트릭스에 겹침 경로 조합과 특수 문자 치환값 조합을 더해 둘이 같음을 보인다.
