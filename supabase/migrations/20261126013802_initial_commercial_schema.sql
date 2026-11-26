CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL,
  email text NOT NULL CHECK (
    email = pg_catalog.lower(pg_catalog.btrim(email)) AND email <> ''
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX customers_email_lower_uidx
  ON public.customers (pg_catalog.lower(email));

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (pg_catalog.btrim(provider) <> ''),
  provider_order_id text CHECK (
    provider_order_id IS NULL OR pg_catalog.btrim(provider_order_id) <> ''
  ),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, customer_id)
);

CREATE UNIQUE INDEX orders_provider_order_uidx
  ON public.orders (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;
CREATE INDEX orders_customer_created_at_idx
  ON public.orders (customer_id, created_at DESC);

CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  order_id uuid,
  product_code text NOT NULL CHECK (pg_catalog.btrim(product_code) <> ''),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'suspended', 'revoked', 'expired')
  ),
  valid_from timestamptz NOT NULL DEFAULT pg_catalog.now(),
  valid_until timestamptz CHECK (valid_until IS NULL OR valid_until > valid_from),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  FOREIGN KEY (order_id, customer_id)
    REFERENCES public.orders (id, customer_id)
    ON DELETE RESTRICT
);

CREATE INDEX licenses_customer_status_idx
  ON public.licenses (customer_id, status);
CREATE INDEX licenses_order_id_idx ON public.licenses (order_id);

CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses (id) ON DELETE RESTRICT,
  device_hash text NOT NULL CHECK (pg_catalog.btrim(device_hash) <> ''),
  device_label text CHECK (
    device_label IS NULL OR pg_catalog.btrim(device_label) <> ''
  ),
  activated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (license_id, device_hash)
);

CREATE INDEX devices_active_license_idx
  ON public.devices (license_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.trials (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers (id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'expired', 'cancelled')
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX trials_status_ends_at_idx ON public.trials (status, ends_at);

CREATE TABLE public.admin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER licenses_set_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trials_set_updated_at
  BEFORE UPDATE ON public.trials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles AS profile
    WHERE profile.user_id = (SELECT auth.uid())
      AND profile.role = 'admin'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.customers,
  public.orders,
  public.licenses,
  public.devices,
  public.trials,
  public.admin_profiles
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.customers,
  public.orders,
  public.licenses,
  public.devices,
  public.trials,
  public.admin_profiles
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.customers,
  public.orders,
  public.licenses,
  public.devices,
  public.trials,
  public.admin_profiles
TO service_role;

CREATE POLICY customers_select_self_or_admin
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY orders_select_customer_or_admin
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.customers AS customer
      WHERE customer.id = orders.customer_id
        AND customer.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY licenses_select_customer_or_admin
  ON public.licenses
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.customers AS customer
      WHERE customer.id = licenses.customer_id
        AND customer.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY devices_select_customer_or_admin
  ON public.devices
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.licenses AS license
      JOIN public.customers AS customer
        ON customer.id = license.customer_id
      WHERE license.id = devices.license_id
        AND customer.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY trials_select_customer_or_admin
  ON public.trials
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1
      FROM public.customers AS customer
      WHERE customer.id = trials.customer_id
        AND customer.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY admin_profiles_select_self
  ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));