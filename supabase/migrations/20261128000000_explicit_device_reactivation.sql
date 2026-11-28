ALTER FUNCTION public.validate_device_entitlement(uuid, text, text)
  RENAME TO validate_device_entitlement_original;

CREATE FUNCTION public.validate_device_entitlement(
  p_customer_id uuid, p_machine_id text, p_device_label text, p_reactivate boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_user_id uuid;
  v_license public.licenses%ROWTYPE;
  v_count integer;
  v_devices jsonb;
BEGIN
  IF p_machine_id IS NULL OR p_machine_id !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid machine identifier';
  END IF;

  SELECT auth_user_id INTO v_user_id FROM public.customers
    WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated customer not found';
  END IF;

  SELECT * INTO v_license FROM public.licenses
    WHERE customer_id = p_customer_id AND status = 'active'
      AND valid_from <= v_now AND (valid_until IS NULL OR valid_until > v_now)
    ORDER BY valid_from DESC, id LIMIT 1 FOR UPDATE;

  IF v_license.id IS NOT NULL AND NOT COALESCE(p_reactivate, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.license_devices
      WHERE user_id = v_user_id AND machine_id = p_machine_id
    )
    AND EXISTS (
      SELECT 1 FROM public.devices AS d
      JOIN public.licenses AS l ON l.id = d.license_id
      WHERE l.customer_id = p_customer_id AND d.device_hash = p_machine_id
        AND d.revoked_at IS NOT NULL
    )
  THEN
    SELECT count(*) INTO v_count FROM public.license_devices WHERE user_id = v_user_id;
    IF v_count < v_license.max_devices THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'machineId', machine_id, 'name', device_name, 'last_seen_at', last_seen_at
      ) ORDER BY created_at), '[]'::jsonb) INTO v_devices
        FROM public.license_devices WHERE user_id = v_user_id;
      RETURN pg_catalog.jsonb_build_object(
        'allowed', false, 'kind', 'license', 'expires_at', v_license.valid_until,
        'server_time', v_now, 'offline_grace_until', NULL,
        'plan_code', v_license.plan_code, 'max_devices', v_license.max_devices,
        'devices', v_devices, 'code', 'DEVICE_REACTIVATION_REQUIRED',
        'message', 'Este computador foi removido. Reative-o para voltar a usá-lo.'
      );
    END IF;
  END IF;

  RETURN public.validate_device_entitlement_original(p_customer_id, p_machine_id, p_device_label);
END;
$function$;

CREATE FUNCTION public.validate_device_entitlement(
  p_customer_id uuid, p_machine_id text, p_device_label text
)
RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $function$
  SELECT public.validate_device_entitlement(p_customer_id, p_machine_id, p_device_label, false);
$function$;

REVOKE ALL ON FUNCTION public.validate_device_entitlement_original(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_device_entitlement(uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_device_entitlement(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_device_entitlement_original(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_device_entitlement(uuid, text, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_device_entitlement(uuid, text, text)
  TO service_role;
