DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'plan_code'
  ) THEN
    ALTER TABLE public.licenses ADD COLUMN plan_code text NOT NULL DEFAULT 'multi_50';
    ALTER TABLE public.licenses ALTER COLUMN plan_code DROP DEFAULT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'licenses' AND column_name = 'max_devices'
  ) THEN
    ALTER TABLE public.licenses ADD COLUMN max_devices integer NOT NULL DEFAULT 2;
    ALTER TABLE public.licenses ALTER COLUMN max_devices DROP DEFAULT;
  END IF;
END;
$migration$;

ALTER TABLE public.licenses
  ADD CONSTRAINT licenses_plan_limit_check CHECK (
    (plan_code = 'solo_30' AND max_devices = 1)
    OR (plan_code = 'multi_50' AND max_devices = 2)
  );

ALTER TABLE public.trials
  ADD COLUMN device_trial_bound boolean NOT NULL DEFAULT false,
  ADD COLUMN legacy_machine_id text;

CREATE TABLE IF NOT EXISTS public.device_trials (
  machine_id text PRIMARY KEY CHECK (machine_id ~ '^[0-9a-f]{64}$'),
  first_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_email text,
  trial_started_at timestamptz NOT NULL,
  trial_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (trial_expires_at > trial_started_at)
);

ALTER TABLE public.device_trials ADD COLUMN enabled boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS public.license_devices (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id text NOT NULL,
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (user_id, machine_id)
);

ALTER TABLE public.device_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_trials, public.license_devices FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.device_trials, public.license_devices FROM authenticated;
GRANT SELECT ON public.license_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_trials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_devices TO service_role;
CREATE POLICY license_devices_select_self
  ON public.license_devices FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.validate_device_entitlement(
  p_customer_id uuid, p_machine_id text, p_device_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_license public.licenses%ROWTYPE;
  v_trial public.trials%ROWTYPE;
  v_device_trial public.device_trials%ROWTYPE;
  v_device public.license_devices%ROWTYPE;
  v_user_id uuid;
  v_devices jsonb;
  v_count integer;
  v_allowed boolean;
  v_message text;
BEGIN
  IF p_machine_id !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid machine identifier';
  END IF;

  SELECT auth_user_id INTO v_user_id FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated customer not found';
  END IF;

  SELECT * INTO v_license FROM public.licenses
    WHERE customer_id = p_customer_id AND status = 'active'
      AND valid_from <= v_now AND (valid_until IS NULL OR valid_until > v_now)
    ORDER BY valid_from DESC, id LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public.license_devices (user_id, machine_id, device_name, last_seen_at, created_at)
      SELECT v_user_id, d.device_hash, d.device_label, COALESCE(d.last_seen_at, d.activated_at), d.activated_at
      FROM public.devices AS d
      WHERE d.license_id = v_license.id AND d.revoked_at IS NULL
      ON CONFLICT (user_id, machine_id) DO NOTHING;
    SELECT * INTO v_device FROM public.license_devices
      WHERE user_id = v_user_id AND machine_id = p_machine_id;
    SELECT count(*) INTO v_count FROM public.license_devices WHERE user_id = v_user_id;
    v_allowed := v_device.id IS NOT NULL OR v_count < v_license.max_devices;

    IF v_allowed THEN
      INSERT INTO public.license_devices (user_id, machine_id, device_name, last_seen_at)
        VALUES (v_user_id, p_machine_id, p_device_label, v_now)
        ON CONFLICT (user_id, machine_id) DO UPDATE SET
          device_name = EXCLUDED.device_name, last_seen_at = EXCLUDED.last_seen_at;
      INSERT INTO public.devices
        (license_id, device_hash, device_label, activated_at, last_seen_at, revoked_at)
      VALUES
        (v_license.id, p_machine_id, p_device_label, v_now, v_now, NULL)
      ON CONFLICT (license_id, device_hash) DO UPDATE SET
        device_label = EXCLUDED.device_label,
        activated_at = CASE WHEN public.devices.revoked_at IS NULL
          THEN public.devices.activated_at ELSE EXCLUDED.activated_at END,
        last_seen_at = EXCLUDED.last_seen_at,
        revoked_at = NULL;
    ELSE
      v_message := CASE WHEN v_license.max_devices = 1
        THEN 'Seu plano Individual (R$ 30) permite apenas 1 computador ativo. Desvincule o dispositivo anterior ou faça upgrade para o plano Multi (R$ 50) no site.'
        ELSE 'Limite de dispositivos do seu plano Multi (R$ 50) atingido. Remova um computador antigo para ativar este.'
      END;
    END IF;

    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'machineId', machine_id, 'name', device_name, 'last_seen_at', last_seen_at
    ) ORDER BY created_at), '[]'::jsonb) INTO v_devices
      FROM public.license_devices WHERE user_id = v_user_id;

    RETURN pg_catalog.jsonb_build_object(
      'allowed', v_allowed, 'kind', 'license', 'expires_at', v_license.valid_until,
      'server_time', v_now, 'offline_grace_until',
        CASE WHEN v_allowed THEN v_now + interval '72 hours' ELSE NULL END,
      'plan_code', v_license.plan_code, 'max_devices', v_license.max_devices,
      'devices', v_devices, 'code', CASE WHEN v_allowed THEN NULL ELSE 'DEVICE_LIMIT_REACHED' END,
      'message', v_message
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_machine_id, 0));
  SELECT * INTO v_trial FROM public.trials WHERE customer_id = p_customer_id FOR UPDATE;
  SELECT * INTO v_device_trial FROM public.device_trials WHERE machine_id = p_machine_id;

  IF v_trial.id IS NULL AND v_device_trial.machine_id IS NULL THEN
    INSERT INTO public.trials (customer_id, starts_at, ends_at, status, device_trial_bound)
      VALUES (p_customer_id, v_now, v_now + interval '7 days', 'active', true)
      RETURNING * INTO v_trial;
  ELSIF v_trial.id IS NULL THEN
    INSERT INTO public.trials (customer_id, starts_at, ends_at, status, device_trial_bound)
      VALUES (p_customer_id, v_device_trial.trial_started_at, v_device_trial.trial_expires_at,
        CASE WHEN v_device_trial.trial_expires_at > v_now THEN 'active' ELSE 'expired' END, true)
      RETURNING * INTO v_trial;
  END IF;

  IF v_device_trial.machine_id IS NULL THEN
    IF v_trial.device_trial_bound THEN
      INSERT INTO public.device_trials (machine_id, trial_started_at, trial_expires_at)
        VALUES (p_machine_id, v_now, v_now + interval '7 days')
        RETURNING * INTO v_device_trial;
    ELSE
      INSERT INTO public.device_trials (machine_id, trial_started_at, trial_expires_at, enabled)
        VALUES (p_machine_id, v_trial.starts_at, v_trial.ends_at, v_trial.status = 'active')
        RETURNING * INTO v_device_trial;
    END IF;
  END IF;

  IF NOT v_trial.device_trial_bound THEN
    UPDATE public.trials SET device_trial_bound = true, legacy_machine_id = p_machine_id
      WHERE id = v_trial.id;
    v_trial.legacy_machine_id := p_machine_id;
  END IF;

  v_allowed := v_trial.status <> 'cancelled' AND v_device_trial.enabled
    AND v_device_trial.trial_expires_at > v_now;
  IF v_trial.legacy_machine_id = p_machine_id THEN
    v_allowed := v_allowed AND v_trial.status = 'active' AND v_trial.ends_at > v_now;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'allowed', v_allowed, 'kind', 'trial',
    'expires_at', CASE WHEN v_trial.legacy_machine_id = p_machine_id
      THEN LEAST(v_trial.ends_at, v_device_trial.trial_expires_at)
      ELSE v_device_trial.trial_expires_at END,
    'server_time', v_now, 'offline_grace_until',
      CASE WHEN v_allowed THEN v_now + interval '72 hours' ELSE NULL END,
    'plan_code', 'trial', 'devices', '[]'::jsonb,
    'message', CASE WHEN v_allowed THEN NULL ELSE
      'Este computador já utilizou o teste gratuito de 7 dias. Escolha o plano de R$ 30 (1 computador) ou R$ 50 (vários computadores) para continuar.' END
  );
END;
$function$;

CREATE FUNCTION public.remove_license_device(p_customer_id uuid, p_machine_id text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
  v_user_id uuid;
BEGIN
  SELECT auth_user_id INTO v_user_id FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  DELETE FROM public.license_devices WHERE user_id = v_user_id AND machine_id = p_machine_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.devices AS d SET revoked_at = pg_catalog.now()
    FROM public.licenses AS l
    WHERE d.license_id = l.id AND l.customer_id = p_customer_id
      AND d.device_hash = p_machine_id AND d.revoked_at IS NULL;
  RETURN v_count > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_device_entitlement(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_license_device(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_device_entitlement(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_license_device(uuid, text) TO service_role;
