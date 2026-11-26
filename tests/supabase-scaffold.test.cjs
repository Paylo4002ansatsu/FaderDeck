'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('Supabase setup documents secure configuration and the approved schema migration', () => {
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'supabase/config.jsonc'), 'utf8');
  const setup = fs.readFileSync(path.join(root, 'supabase/README.md'), 'utf8');
  const migrationNotes = fs.readFileSync(path.join(root, 'supabase/migrations/README.md'), 'utf8');
  const functionNotes = fs.readFileSync(path.join(root, 'supabase/functions/README.md'), 'utf8');
  const migrationFiles = fs
    .readdirSync(path.join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'));
  const initialMigrationFile = '20261126013802_initial_commercial_schema.sql';
  const privilegeMigrationFile = '20261126025315_restrict_is_admin_anon_execution.sql';
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations', initialMigrationFile),
    'utf8',
  );
  const privilegeMigration = fs.readFileSync(
    path.join(root, 'supabase/migrations', privilegeMigrationFile),
    'utf8',
  );
  const functionFiles = fs
    .readdirSync(path.join(root, 'supabase/functions'))
    .filter((name) => name !== 'README.md');

  for (const variable of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    assert.match(envExample, new RegExp(`^${variable}=$`, 'm'));
  }
  assert.match(envExample, /Server-only/);
  assert.match(envExample, /Never expose this variable/);
  assert.match(config, /"enable_signup": false/);
  const seedConfig = config.match(/"seed": \{([\s\S]*?)\n\s{4}\},/)?.[1];
  assert.ok(seedConfig);
  assert.match(seedConfig, /"enabled": false/);
  assert.match(seedConfig, /"sql_paths": \[\]/);
  assert.match(setup, /modelo de dados aprovado/i);
  assert.match(setup, /RLS/i);
  assert.match(setup, /aplicada ao banco local e ao projeto Supabase\s+remoto/i);
  assert.match(migrationNotes, /aplicada ao projeto remoto após autorização/i);
  assert.match(functionNotes, /Não há funções executáveis/);
  assert.equal(migrationFiles.length, 2);
  assert.ok(migrationFiles.includes(initialMigrationFile));
  assert.match(initialMigrationFile, /^\d{14}_initial_commercial_schema\.sql$/);
  assert.match(privilegeMigrationFile, /^\d{14}_restrict_is_admin_anon_execution\.sql$/);
  for (const table of ['customers', 'orders', 'licenses', 'devices', 'trials', 'admin_profiles']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table} \\(`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`));
    assert.match(migration, new RegExp(`CREATE POLICY [^;]+ ON public\\.${table}`, 's'));
  }
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.is_admin\(\) TO authenticated;/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]+FROM anon, authenticated;/);
  assert.match(privilegeMigration, /^REVOKE EXECUTE ON FUNCTION public\.is_admin\(\) FROM anon;$/m);
  assert.match(migration, /GRANT SELECT ON TABLE[\s\S]+TO authenticated;/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]+TO service_role;/);
  assert.doesNotMatch(migration, /(?:CREATE|GRANT)[\s\S]*?\bTO anon\b/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]* TO authenticated;/);
  assert.deepEqual(functionFiles, []);

  for (const relativePath of ['client/index.html', 'docs/index.html', 'main.js', 'server.cjs']) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /SUPABASE_SECRET_KEY/);
  }
});
