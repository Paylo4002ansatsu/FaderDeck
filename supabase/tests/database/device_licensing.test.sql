BEGIN;
SELECT extensions.plan(26);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000201', 'solo@example.invalid'),
  ('00000000-0000-4000-8000-000000000202', 'multi@example.invalid'),
  ('00000000-0000-4000-8000-000000000203', 'trial@example.invalid'),
  ('00000000-0000-4000-8000-000000000204', 'legacy@example.invalid'),
  ('00000000-0000-4000-8000-000000000205', 'legacy-license@example.invalid'),
  ('00000000-0000-4000-8000-000000000206', 'second-trial@example.invalid');
INSERT INTO public.customers (id, auth_user_id, email) VALUES
  ('10000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000201', 'solo@example.invalid'),
  ('10000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000202', 'multi@example.invalid'),
  ('10000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000203', 'trial@example.invalid'),
  ('10000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000204', 'legacy@example.invalid'),
  ('10000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000205', 'legacy-license@example.invalid'),
  ('10000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000206', 'second-trial@example.invalid');
INSERT INTO public.licenses (customer_id, product_code, status, plan_code, max_devices) VALUES
  ('10000000-0000-4000-8000-000000000201', 'solo', 'active', 'solo_30', 1),
  ('10000000-0000-4000-8000-000000000202', 'multi', 'active', 'multi_50', 2),
  ('10000000-0000-4000-8000-000000000205', 'legacy', 'active', 'solo_30', 1);
INSERT INTO public.license_devices (user_id, machine_id, device_name)
VALUES ('00000000-0000-4000-8000-000000000202', repeat('c', 64), 'Existing');
INSERT INTO public.devices (license_id, device_hash, device_label)
SELECT id, repeat('6', 64), 'Legacy' FROM public.licenses WHERE product_code = 'legacy';

SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000201', repeat('a', 64), 'First')->>'allowed',
  'true', 'Individual activates first computer');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000201', repeat('b', 64), 'Second')->>'code',
  'DEVICE_LIMIT_REACHED', 'Individual blocks second computer');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000202', repeat('c', 64), 'First')->>'allowed',
  'true', 'Multi activates first computer');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000202', repeat('d', 64), 'Second')->>'allowed',
  'true', 'Multi activates second computer');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000202', repeat('e', 64), 'Third')->>'code',
  'DEVICE_LIMIT_REACHED', 'Multi blocks third computer');
SELECT extensions.is(
  public.remove_license_device('10000000-0000-4000-8000-000000000201', repeat('a', 64)),
  true, 'Owner removes device');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000201', repeat('b', 64), 'Second')->>'allowed',
  'true', 'Individual activates replacement after removal');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000201', repeat('a', 64), 'First', true)->>'code',
  'DEVICE_LIMIT_REACHED', 'Explicit reactivation cannot bypass the plan limit');
SELECT extensions.is(
  public.remove_license_device('10000000-0000-4000-8000-000000000201', repeat('b', 64)),
  true, 'Replacement can be removed');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000201', repeat('b', 64), 'Second')->>'code',
  'DEVICE_REACTIVATION_REQUIRED', 'Removed computer remains revoked when a slot is free');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000201', repeat('b', 64), 'Second', true)->>'allowed',
  'true', 'Removed computer can be explicitly reactivated');
SELECT extensions.is(
  public.remove_license_device('10000000-0000-4000-8000-000000000201', repeat('c', 64)),
  false, 'Cannot remove another customer device');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000205', repeat('5', 64), 'New')->>'code',
  'DEVICE_LIMIT_REACHED', 'Legacy device registration is honored');
SELECT extensions.is(
  public.remove_license_device('10000000-0000-4000-8000-000000000205', repeat('6', 64)),
  true, 'Legacy device can be removed');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000205', repeat('5', 64), 'New')->>'allowed',
  'true', 'Replacement can activate after legacy removal');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000205', repeat('6', 64), 'Legacy')->>'code',
  'DEVICE_LIMIT_REACHED', 'Removed legacy device is not silently restored');

INSERT INTO public.device_trials (machine_id, trial_started_at, trial_expires_at)
VALUES (repeat('f', 64), now() - interval '8 days', now() - interval '1 day');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000203', repeat('f', 64), 'Used')->>'allowed',
  'false', 'Expired device trial is not restarted for a new account');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000206', repeat('f', 64), 'Used')->>'allowed',
  'false', 'Another account cannot restart the expired device trial');
SELECT extensions.is(
  (SELECT ends_at FROM public.trials WHERE customer_id = '10000000-0000-4000-8000-000000000206'),
  (SELECT trial_expires_at FROM public.device_trials WHERE machine_id = repeat('f', 64)),
  'Another account retains the original device trial expiry');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000203', repeat('9', 64), 'New')->>'allowed',
  'true', 'A different computer receives its own trial');
INSERT INTO public.trials (customer_id, starts_at, ends_at, status)
VALUES ('10000000-0000-4000-8000-000000000204', now() - interval '8 days', now() - interval '1 day', 'expired');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000204', repeat('8', 64), 'Legacy')->>'allowed',
  'false', 'Legacy trial is preserved for the first computer');
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000204', repeat('7', 64), 'New')->>'allowed',
  'true', 'A later computer can receive its own trial');
SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege('authenticated', 'public.validate_device_entitlement(uuid,text,text)', 'EXECUTE'),
  'Authenticated clients cannot invoke privileged validation directly');
SELECT extensions.ok(
  NOT pg_catalog.has_function_privilege('authenticated', 'public.validate_device_entitlement(uuid,text,text,boolean)', 'EXECUTE')
  AND NOT pg_catalog.has_function_privilege('authenticated', 'public.validate_device_entitlement_original(uuid,text,text)', 'EXECUTE'),
  'Authenticated clients cannot invoke reactivation or bypass validation');
SELECT extensions.ok(
  NOT pg_catalog.has_table_privilege('authenticated', 'public.license_devices', 'INSERT')
  AND NOT pg_catalog.has_table_privilege('authenticated', 'public.device_trials', 'INSERT'),
  'Authenticated clients cannot bypass device and trial registration');
SET LOCAL ROLE service_role;
SELECT extensions.is(
  public.validate_device_entitlement('10000000-0000-4000-8000-000000000202', repeat('c', 64), 'First')->>'allowed',
  'true', 'Service role can validate devices');
RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
