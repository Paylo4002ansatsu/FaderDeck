# Migrations

`20261126013802_initial_commercial_schema.sql` implementa o modelo aprovado e
define as tabelas comerciais com chaves, índices, grants e RLS. Foi aplicada e
validada no banco local com `npx supabase db lint --schema public --fail-on error`,
e aplicada ao projeto remoto após autorização explícita.
