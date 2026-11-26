# Migrations

`20261126013802_initial_commercial_schema.sql` implementa o modelo aprovado e
define as tabelas comerciais com chaves, índices, grants e RLS. Foi aplicada e
validada no banco local com `npx supabase db lint --schema public --fail-on error`,
e aplicada ao projeto remoto após autorização explícita.

`20261126025315_restrict_is_admin_anon_execution.sql` revoga o privilégio
`EXECUTE` de `anon` na função `public.is_admin()`. Foi criada após uma auditoria
read-only do ACL remoto e aplicada ao projeto remoto após autorização
explícita.
