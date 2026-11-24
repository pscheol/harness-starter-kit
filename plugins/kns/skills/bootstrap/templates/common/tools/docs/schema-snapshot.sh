#!/usr/bin/env bash
# 빈 Postgres 컨테이너에 마이그레이션을 버전 순서로 적용하고 카탈로그 질의를 돌린다(기능 문서 refresh schema).
# 개발 DB 를 읽지 않는 이유는 손으로 만진 흔적이 섞일 수 있어서다.
#
#   bash tools/docs/schema-snapshot.sh <대상 이름> <지문 출력(쓰지 않음, 자리만)> --migrations DIR \
#        [--extra-migrations DIR] --catalog-sql tools/docs/sql/catalog.sql --catalog-out OUT.json
#
# 환경: SCHEMA_SNAPSHOT_IMAGE(기본 postgres:18). 마이그레이션에 롤·확장이 필요하면 첫 마이그레이션이 만든다.
set -euo pipefail

[ $# -ge 2 ] || { echo "사용: $0 <대상> <출력> --migrations DIR [--extra-migrations DIR] --catalog-sql FILE --catalog-out FILE" >&2; exit 2; }
TARGET="$1"; shift 2
MIGRATIONS="" EXTRA="" SQL="" OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --migrations) MIGRATIONS="$2"; shift 2 ;;
    --extra-migrations) EXTRA="$2"; shift 2 ;;
    --catalog-sql) SQL="$2"; shift 2 ;;
    --catalog-out) OUT="$2"; shift 2 ;;
    *) echo "✖ 모르는 인자: $1" >&2; exit 2 ;;
  esac
done
[ -d "$MIGRATIONS" ] && [ -f "$SQL" ] && [ -n "$OUT" ] || { echo "✖ --migrations·--catalog-sql·--catalog-out 이 필요하다" >&2; exit 2; }

CONTAINER="schema-snapshot-$TARGET-$$"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=snapshot -e POSTGRES_USER=snapshot -e POSTGRES_DB=snapshot \
  "${SCHEMA_SNAPSHOT_IMAGE:-postgres:18}" >/dev/null
for _ in $(seq 1 60); do docker exec "$CONTAINER" pg_isready -U snapshot >/dev/null 2>&1 && break; sleep 1; done

apply() {
  local dir="$1"
  find "$dir" -maxdepth 1 -name 'V*.sql' -print | sed -E 's|.*/V([0-9]+)__.*|\1 &|' | sort -n -k1,1 | cut -d' ' -f2- |
    while IFS= read -r file; do
      docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -1 -U snapshot -d snapshot < "$file" >/dev/null
    done
}
apply "$MIGRATIONS"
[ -z "$EXTRA" ] || apply "$EXTRA"
docker exec -i "$CONTAINER" psql -X -At -v ON_ERROR_STOP=1 -U snapshot -d snapshot < "$SQL" > "$OUT"
echo "✔ 카탈로그 → $OUT"
