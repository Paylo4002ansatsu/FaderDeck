BEGIN;

SELECT extensions.plan(79);

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'pgtap-customer@example.invalid',
    '',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'pgtap-other-customer@example.invalid',
    '',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'authenticated',
    'authenticated',
    'pgtap-admin@example.invalid',
    '',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  );

INSERT INTO public.customers (id, auth_user_id, email)
VALUES
  (
    '10000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000101',
    'pgtap-customer@example.invalid'
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000102',
    'pgtap-other-customer@example.invalid'
  );

INSERT INTO public.orders (
  id,
  customer_id,
  provider,
  provider_order_id,
  amount_minor,
  currency
)
VALUES
  (
    '20000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000101',
    'pgtap',
    'pgtap-order-customer',
    1000,
    'USD'
  ),
  (
    '20000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000102',
    'pgtap',
    'pgtap-order-other',
    2000,
    'USD'
  );

INSERT INTO public.licenses (id, customer_id, product_code, plan_code, max_devices)
VALUES
  (
    '30000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000101',
    'pgtap-customer', 'solo_30', 1
  ),
  (
    '30000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000102',
    'pgtap-other', 'multi_50', 2
  );

INSERT INTO public.devices (id, license_id, device_hash)
VALUES
  (
    '40000000-0000-4000-8000-000000000101',
    '30000000-0000-4000-8000-000000000101',
    'pgtap-device-customer'
  ),
  (
    '40000000-0000-4000-8000-000000000102',
    '30000000-0000-4000-8000-000000000102',
    'pgtap-device-other'
  );

INSERT INTO public.trials (id, customer_id, ends_at)
VALUES
  (
    '50000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000101',
    pg_catalog.now() + INTERVAL '7 days'
  ),
  (
    '50000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000102',
    pg_catalog.now() + INTERVAL '7 days'
  );

INSERT INTO public.admin_profiles (user_id)
VALUES ('00000000-0000-4000-8000-000000000103');

SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
  'anon does not have EXECUTE privilege on public.is_admin()'
);
SELECT extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'),
  'authenticated has EXECUTE privilege on public.is_admin()'
);
SELECT extensions.ok(
  (
    SELECT procedure.prosecdef
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = 'public.is_admin()'::pg_catalog.regprocedure
  ),
  'public.is_admin() remains SECURITY DEFINER'
);
SELECT extensions.ok(
  (
    SELECT COALESCE(
      procedure.proconfig @> ARRAY['search_path=""']::text[],
      false
    )
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = 'public.is_admin()'::pg_catalog.regprocedure
  ),
  'public.is_admin() keeps an empty search_path'
);

SET LOCAL ROLE anon;

SELECT extensions.throws_ok(
  'SELECT public.is_admin()',
  '42501',
  'permission denied for function is_admin',
  'anon calling public.is_admin() fails with a permission error'
);

WITH table_cases (table_name, select_sql, insert_sql, update_sql, delete_sql) AS (
  VALUES
    (
      'customers',
      'SELECT * FROM public.customers LIMIT 1',
      'INSERT INTO public.customers (id, email) VALUES (''10000000-0000-4000-8000-000000000201'', ''blocked-customer@example.invalid'')',
      'UPDATE public.customers SET email = ''blocked-customer@example.invalid'' WHERE id = ''10000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.customers WHERE id = ''10000000-0000-4000-8000-000000000101'''
    ),
    (
      'orders',
      'SELECT * FROM public.orders LIMIT 1',
      'INSERT INTO public.orders (id, customer_id, provider, amount_minor, currency) VALUES (''20000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', ''pgtap'', 100, ''USD'')',
      'UPDATE public.orders SET amount_minor = 1001 WHERE id = ''20000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.orders WHERE id = ''20000000-0000-4000-8000-000000000101'''
    ),
    (
      'licenses',
      'SELECT * FROM public.licenses LIMIT 1',
      'INSERT INTO public.licenses (id, customer_id, product_code) VALUES (''30000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', ''blocked'')',
      'UPDATE public.licenses SET status = ''suspended'' WHERE id = ''30000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.licenses WHERE id = ''30000000-0000-4000-8000-000000000101'''
    ),
    (
      'devices',
      'SELECT * FROM public.devices LIMIT 1',
      'INSERT INTO public.devices (id, license_id, device_hash) VALUES (''40000000-0000-4000-8000-000000000201'', ''30000000-0000-4000-8000-000000000101'', ''blocked-device'')',
      'UPDATE public.devices SET device_label = ''blocked'' WHERE id = ''40000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.devices WHERE id = ''40000000-0000-4000-8000-000000000101'''
    ),
    (
      'trials',
      'SELECT * FROM public.trials LIMIT 1',
      'INSERT INTO public.trials (id, customer_id, ends_at) VALUES (''50000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', pg_catalog.now() + INTERVAL ''7 days'')',
      'UPDATE public.trials SET status = ''cancelled'' WHERE id = ''50000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.trials WHERE id = ''50000000-0000-4000-8000-000000000101'''
    ),
    (
      'admin_profiles',
      'SELECT * FROM public.admin_profiles LIMIT 1',
      'INSERT INTO public.admin_profiles (user_id) VALUES (''00000000-0000-4000-8000-000000000101'')',
      'UPDATE public.admin_profiles SET role = ''admin'' WHERE user_id = ''00000000-0000-4000-8000-000000000103''',
      'DELETE FROM public.admin_profiles WHERE user_id = ''00000000-0000-4000-8000-000000000103'''
    )
),
operations (table_name, operation, statement) AS (
  SELECT table_name, 'SELECT', select_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'INSERT', insert_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'UPDATE', update_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'DELETE', delete_sql FROM table_cases
)
SELECT extensions.throws_ok(
  statement,
  '42501',
  pg_catalog.format('permission denied for table %s', table_name),
  pg_catalog.format('anon cannot %s public.%s', operation, table_name)
)
FROM operations
ORDER BY table_name, operation;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);

SELECT extensions.is(
  public.is_admin(),
  false,
  'authenticated non-admin is not considered an administrator'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.customers),
  1::bigint,
  'customer can read only their own customer row'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.orders),
  1::bigint,
  'customer can read only their own orders'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.licenses),
  1::bigint,
  'customer can read only their own licenses'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.devices),
  1::bigint,
  'customer can read only their own devices'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.trials),
  1::bigint,
  'customer can read only their own trials'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.admin_profiles),
  0::bigint,
  'customer cannot read administrator profiles'
);

WITH table_cases (table_name, insert_sql, update_sql, delete_sql) AS (
  VALUES
    (
      'customers',
      'INSERT INTO public.customers (id, email) VALUES (''10000000-0000-4000-8000-000000000201'', ''blocked-customer@example.invalid'')',
      'UPDATE public.customers SET email = ''blocked-customer@example.invalid'' WHERE id = ''10000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.customers WHERE id = ''10000000-0000-4000-8000-000000000101'''
    ),
    (
      'orders',
      'INSERT INTO public.orders (id, customer_id, provider, amount_minor, currency) VALUES (''20000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', ''pgtap'', 100, ''USD'')',
      'UPDATE public.orders SET amount_minor = 1001 WHERE id = ''20000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.orders WHERE id = ''20000000-0000-4000-8000-000000000101'''
    ),
    (
      'licenses',
      'INSERT INTO public.licenses (id, customer_id, product_code) VALUES (''30000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', ''blocked'')',
      'UPDATE public.licenses SET status = ''suspended'' WHERE id = ''30000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.licenses WHERE id = ''30000000-0000-4000-8000-000000000101'''
    ),
    (
      'devices',
      'INSERT INTO public.devices (id, license_id, device_hash) VALUES (''40000000-0000-4000-8000-000000000201'', ''30000000-0000-4000-8000-000000000101'', ''blocked-device'')',
      'UPDATE public.devices SET device_label = ''blocked'' WHERE id = ''40000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.devices WHERE id = ''40000000-0000-4000-8000-000000000101'''
    ),
    (
      'trials',
      'INSERT INTO public.trials (id, customer_id, ends_at) VALUES (''50000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', pg_catalog.now() + INTERVAL ''7 days'')',
      'UPDATE public.trials SET status = ''cancelled'' WHERE id = ''50000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.trials WHERE id = ''50000000-0000-4000-8000-000000000101'''
    ),
    (
      'admin_profiles',
      'INSERT INTO public.admin_profiles (user_id) VALUES (''00000000-0000-4000-8000-000000000101'')',
      'UPDATE public.admin_profiles SET role = ''admin'' WHERE user_id = ''00000000-0000-4000-8000-000000000103''',
      'DELETE FROM public.admin_profiles WHERE user_id = ''00000000-0000-4000-8000-000000000103'''
    )
),
operations (table_name, operation, statement) AS (
  SELECT table_name, 'INSERT', insert_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'UPDATE', update_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'DELETE', delete_sql FROM table_cases
)
SELECT extensions.throws_ok(
  statement,
  '42501',
  pg_catalog.format('permission denied for table %s', table_name),
  pg_catalog.format('authenticated customer cannot %s public.%s', operation, table_name)
)
FROM operations
ORDER BY table_name, operation;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);
SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);

SELECT extensions.is(
  public.is_admin(),
  true,
  'authenticated administrator is recognized by public.is_admin()'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.customers),
  2::bigint,
  'administrator can read all customer rows'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.orders),
  2::bigint,
  'administrator can read all orders'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.licenses),
  2::bigint,
  'administrator can read all licenses'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.devices),
  2::bigint,
  'administrator can read all devices'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.trials),
  2::bigint,
  'administrator can read all trials'
);
SELECT extensions.is(
  (SELECT pg_catalog.count(*) FROM public.admin_profiles),
  1::bigint,
  'administrator can read their own administrator profile only'
);

WITH table_cases (table_name, insert_sql, update_sql, delete_sql) AS (
  VALUES
    (
      'customers',
      'INSERT INTO public.customers (id, email) VALUES (''10000000-0000-4000-8000-000000000201'', ''blocked-customer@example.invalid'')',
      'UPDATE public.customers SET email = ''blocked-customer@example.invalid'' WHERE id = ''10000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.customers WHERE id = ''10000000-0000-4000-8000-000000000101'''
    ),
    (
      'orders',
      'INSERT INTO public.orders (id, customer_id, provider, amount_minor, currency) VALUES (''20000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', ''pgtap'', 100, ''USD'')',
      'UPDATE public.orders SET amount_minor = 1001 WHERE id = ''20000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.orders WHERE id = ''20000000-0000-4000-8000-000000000101'''
    ),
    (
      'licenses',
      'INSERT INTO public.licenses (id, customer_id, product_code) VALUES (''30000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', ''blocked'')',
      'UPDATE public.licenses SET status = ''suspended'' WHERE id = ''30000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.licenses WHERE id = ''30000000-0000-4000-8000-000000000101'''
    ),
    (
      'devices',
      'INSERT INTO public.devices (id, license_id, device_hash) VALUES (''40000000-0000-4000-8000-000000000201'', ''30000000-0000-4000-8000-000000000101'', ''blocked-device'')',
      'UPDATE public.devices SET device_label = ''blocked'' WHERE id = ''40000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.devices WHERE id = ''40000000-0000-4000-8000-000000000101'''
    ),
    (
      'trials',
      'INSERT INTO public.trials (id, customer_id, ends_at) VALUES (''50000000-0000-4000-8000-000000000201'', ''10000000-0000-4000-8000-000000000101'', pg_catalog.now() + INTERVAL ''7 days'')',
      'UPDATE public.trials SET status = ''cancelled'' WHERE id = ''50000000-0000-4000-8000-000000000101''',
      'DELETE FROM public.trials WHERE id = ''50000000-0000-4000-8000-000000000101'''
    ),
    (
      'admin_profiles',
      'INSERT INTO public.admin_profiles (user_id) VALUES (''00000000-0000-4000-8000-000000000101'')',
      'UPDATE public.admin_profiles SET role = ''admin'' WHERE user_id = ''00000000-0000-4000-8000-000000000103''',
      'DELETE FROM public.admin_profiles WHERE user_id = ''00000000-0000-4000-8000-000000000103'''
    )
),
operations (table_name, operation, statement) AS (
  SELECT table_name, 'INSERT', insert_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'UPDATE', update_sql FROM table_cases
  UNION ALL
  SELECT table_name, 'DELETE', delete_sql FROM table_cases
)
SELECT extensions.throws_ok(
  statement,
  '42501',
  pg_catalog.format('permission denied for table %s', table_name),
  pg_catalog.format('authenticated administrator cannot %s public.%s', operation, table_name)
)
FROM operations
ORDER BY table_name, operation;

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
