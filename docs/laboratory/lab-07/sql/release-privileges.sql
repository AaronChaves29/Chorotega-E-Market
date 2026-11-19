-- PROPUESTA: no ejecutar sin autorización, respaldo y prueba aislada.
-- psql -X -v ON_ERROR_STOP=1 -v technical_role=ROL_VERIFICADO \
--   -v recovery_file=/ruta/privilegios-recuperacion-UNICO.sql -f release-privileges.sql
-- Usar conexión TLS verificada y credenciales por canal seguro, nunca argumentos/logs.
-- recovery_file debe ser un nombre nuevo en un directorio privado del operador.
\set ON_ERROR_STOP on
\if :{?technical_role}
\else
  \echo 'Falta technical_role verificado'
  \quit 1
\endif
\if :{?recovery_file}
\else
  \echo 'Falta recovery_file privado y nuevo'
  \quit 1
\endif
BEGIN;
SELECT set_config('release.technical_role', :'technical_role', true);
DO $guard$
BEGIN
  IF current_setting('release.technical_role') IN ('anon','authenticated','PUBLIC')
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname=current_setting('release.technical_role'))
  THEN RAISE EXCEPTION 'Rol técnico no válido'; END IF;
END $guard$;

-- Auditar ACL, propietarios, RLS, membresías y permisos predeterminados; sin datos.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','S') ORDER BY c.relname;
SELECT pg_get_userbyid(roleid) AS role, pg_get_userbyid(member) AS member
FROM pg_auth_members;
SELECT pg_get_userbyid(defaclrole) AS owner, n.nspname, defaclobjtype, defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace;
-- No cambiar DEFAULT PRIVILEGES globalmente: la migración 6 protege sus objetos.

CREATE TEMP TABLE release_objects ON COMMIT DROP AS
SELECT c.oid, c.relkind, c.relname,
 c.oid='public.typeorm_migrations'::regclass AS history
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND (
 c.relname IN ('typeorm_migrations','usuario','tienda','producto','categoria',
 'barrio','pedido','detalle_pedido','repartidor','entrega')
 OR c.oid=pg_get_serial_sequence('public.typeorm_migrations','id')::regclass);

CREATE TEMP TABLE release_technical_before ON COMMIT DROP AS
SELECT o.oid, p.privilege,
 CASE WHEN o.relkind='S' THEN has_sequence_privilege(:'technical_role',o.oid,p.privilege)
 ELSE has_table_privilege(:'technical_role',o.oid,p.privilege) END AS allowed
FROM release_objects o CROSS JOIN LATERAL unnest(
 CASE WHEN o.relkind='S' THEN ARRAY['USAGE','SELECT','UPDATE']
 ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] END
) AS p(privilege);
TABLE release_technical_before;

-- Snapshot exacto de los grants que se revocarán; guarda solo SQL de recuperación.
-- No contiene datos comerciales ni credenciales. Proteger el archivo local (umask 077).
\pset tuples_only on
\pset format unaligned
SELECT format('GRANT %s ON %s public.%I TO %s%s;',
 a.privilege_type, CASE WHEN o.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,
 o.relname, CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM release_objects o JOIN pg_class c ON c.oid=o.oid
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE (a.grantee=0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated'))
 AND (o.history OR o.relkind='S' OR a.privilege_type='TRUNCATE')
\g :recovery_file
\pset tuples_only off
\pset format aligned

REVOKE ALL ON TABLE public.typeorm_migrations FROM PUBLIC;
REVOKE TRUNCATE ON TABLE public.usuario, public.tienda, public.producto,
 public.categoria, public.barrio, public.pedido, public.detalle_pedido,
 public.repartidor, public.entrega FROM PUBLIC;
DO $revoke$
DECLARE web_role text; seq text;
BEGIN
  seq := pg_get_serial_sequence('public.typeorm_migrations','id');
  IF seq IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC',seq); END IF;
  FOR web_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.typeorm_migrations FROM %I',web_role);
    IF seq IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I',seq,web_role); END IF;
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.usuario, public.tienda, public.producto,
      public.categoria, public.barrio, public.pedido, public.detalle_pedido,
      public.repartidor, public.entrega FROM %I',web_role);
  END LOOP;
END $revoke$;

-- Fallar y revertir si el cambio afecta permisos efectivos del rol técnico o si
-- membresías adicionales todavía permiten los privilegios prohibidos.
DO $verify$
DECLARE r record; role_name text; privilege text; allowed boolean;
BEGIN
  FOR r IN SELECT b.*,o.relkind FROM release_technical_before b JOIN release_objects o ON o.oid=b.oid LOOP
    allowed := CASE WHEN r.relkind='S' THEN has_sequence_privilege(current_setting('release.technical_role'),r.oid,r.privilege)
      ELSE has_table_privilege(current_setting('release.technical_role'),r.oid,r.privilege) END;
    IF allowed IS DISTINCT FROM r.allowed THEN RAISE EXCEPTION 'Cambió un permiso técnico; rollback obligatorio'; END IF;
  END LOOP;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    FOR r IN SELECT * FROM release_objects LOOP
      FOREACH privilege IN ARRAY CASE WHEN r.relkind='S' THEN ARRAY['USAGE','SELECT','UPDATE']
        WHEN r.history THEN ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
        ELSE ARRAY['TRUNCATE'] END LOOP
        allowed := CASE WHEN r.relkind='S' THEN has_sequence_privilege(role_name,r.oid,privilege)
          ELSE has_table_privilege(role_name,r.oid,privilege) END;
        IF allowed THEN RAISE EXCEPTION 'Quedan permisos heredados web; revisar membresías antes de continuar'; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $verify$;
SELECT c.relname, c.relacl FROM pg_class c JOIN release_objects o ON o.oid=c.oid;
COMMIT;
-- Recuperación: primero revisar archivo de grants y motivo del fallo.
-- Solo con autorización: psql -X -v ON_ERROR_STOP=1 --single-transaction -f ARCHIVO_RECUPERACION
-- Esto restaura privilegios anteriores (incluidos inseguros); nunca hacerlo automáticamente.
