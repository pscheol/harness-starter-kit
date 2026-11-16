-- 기능 문서(tools/docs)가 읽는 DB 카탈로그. 한 DB 의 업무 테이블을 JSON 한 줄로 낸다.
-- scripts/schema-fingerprint.sh --catalog-sql 로, 마이그레이션만 적용한 빈 Postgres 에서 돈다.
-- 파티션 자식은 부모로 읽는다. Flyway 기록 표와 시스템 스키마는 뺀다.
WITH business AS (
    SELECT c.oid,
           n.nspname AS schema_name,
           c.relname AS table_name,
           c.relkind,
           c.relrowsecurity,
           c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp%'
      AND c.relname <> 'flyway_schema_history'
)
SELECT json_build_object(
    'schemas', (
        SELECT COALESCE(json_agg(json_build_object(
            'name', n.nspname,
            'comment', obj_description(n.oid, 'pg_namespace')
        ) ORDER BY n.nspname), '[]'::json)
        FROM pg_namespace n
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp%'
    ),
    'tables', COALESCE((
        SELECT json_agg(json_build_object(
            'schema', b.schema_name,
            'name', b.table_name,
            'kind', CASE b.relkind WHEN 'p' THEN 'partitioned' ELSE 'table' END,
            'comment', obj_description(b.oid, 'pg_class'),
            'rls', b.relrowsecurity,
            'rls_forced', b.relforcerowsecurity,
            'partition_key', CASE b.relkind WHEN 'p' THEN pg_get_partkeydef(b.oid) END,
            'partitions', (SELECT count(*) FROM pg_inherits i WHERE i.inhparent = b.oid),
            'columns', (
                SELECT COALESCE(json_agg(json_build_object(
                    'name', a.attname,
                    'type', format_type(a.atttypid, a.atttypmod),
                    'nullable', NOT a.attnotnull,
                    'default', pg_get_expr(d.adbin, d.adrelid),
                    'identity', a.attidentity <> '',
                    'generated', a.attgenerated <> '',
                    'comment', col_description(b.oid, a.attnum)
                ) ORDER BY a.attnum), '[]'::json)
                FROM pg_attribute a
                LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = b.oid AND a.attnum > 0 AND NOT a.attisdropped
            ),
            'indexes', (
                SELECT COALESCE(json_agg(json_build_object(
                    'name', ic.relname,
                    'definition', pg_get_indexdef(ix.indexrelid),
                    'unique', ix.indisunique,
                    'primary', ix.indisprimary,
                    'columns', (
                        SELECT COALESCE(json_agg(pg_get_indexdef(ix.indexrelid, k + 1, true) ORDER BY k), '[]'::json)
                        FROM generate_subscripts(ix.indkey, 1) AS k
                        WHERE k < ix.indnkeyatts
                    ),
                    'predicate', pg_get_expr(ix.indpred, ix.indrelid)
                ) ORDER BY ic.relname), '[]'::json)
                FROM pg_index ix
                JOIN pg_class ic ON ic.oid = ix.indexrelid
                WHERE ix.indrelid = b.oid
            ),
            'constraints', (
                SELECT COALESCE(json_agg(json_build_object(
                    'name', co.conname,
                    'type', co.contype,
                    'definition', pg_get_constraintdef(co.oid)
                ) ORDER BY co.conname), '[]'::json)
                FROM pg_constraint co
                WHERE co.conrelid = b.oid AND co.contype IN ('p', 'u', 'c', 'f', 'x')
            ),
            'foreign_keys', (
                SELECT COALESCE(json_agg(json_build_object(
                    'name', co.conname,
                    'columns', (
                        SELECT json_agg(a.attname ORDER BY u.ord)
                        FROM unnest(co.conkey) WITH ORDINALITY AS u(attnum, ord)
                        JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = u.attnum
                    ),
                    'ref_table', rn.nspname || '.' || rc.relname,
                    'ref_columns', (
                        SELECT json_agg(a.attname ORDER BY u.ord)
                        FROM unnest(co.confkey) WITH ORDINALITY AS u(attnum, ord)
                        JOIN pg_attribute a ON a.attrelid = co.confrelid AND a.attnum = u.attnum
                    ),
                    'on_delete', co.confdeltype
                ) ORDER BY co.conname), '[]'::json)
                FROM pg_constraint co
                JOIN pg_class rc ON rc.oid = co.confrelid
                JOIN pg_namespace rn ON rn.oid = rc.relnamespace
                WHERE co.conrelid = b.oid AND co.contype = 'f'
            ),
            'policies', (
                SELECT COALESCE(json_agg(json_build_object(
                    'name', p.polname,
                    'command', p.polcmd,
                    'permissive', p.polpermissive,
                    'roles', (
                        SELECT json_agg(CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY 1)
                        FROM unnest(p.polroles) AS r
                    ),
                    'using', pg_get_expr(p.polqual, p.polrelid),
                    'check', pg_get_expr(p.polwithcheck, p.polrelid)
                ) ORDER BY p.polname), '[]'::json)
                FROM pg_policy p
                WHERE p.polrelid = b.oid
            ),
            'triggers', (
                SELECT COALESCE(json_agg(tg.tgname ORDER BY tg.tgname), '[]'::json)
                FROM pg_trigger tg
                WHERE tg.tgrelid = b.oid AND NOT tg.tgisinternal
            )
        ) ORDER BY b.schema_name, b.table_name)
        FROM business b
    ), '[]'::json)
);
