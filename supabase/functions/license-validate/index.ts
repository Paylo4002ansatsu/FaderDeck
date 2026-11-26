import {
  authenticateAndCreatePrivilegedClient,
  ensureCustomer,
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from '../_shared/auth.ts';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function entitlementResponse(
  allowed: boolean,
  kind: 'license' | 'trial' | 'none',
  expiresAt: string | null,
  serverTime: string,
  reason?: string,
): Response {
  return jsonResponse({
    allowed,
    kind,
    expires_at: expiresAt,
    server_time: serverTime,
    offline_grace_until: allowed
      ? new Date(Date.parse(serverTime) + DAY_IN_MILLISECONDS).toISOString()
      : null,
    ...(reason ? { reason } : {}),
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const { user, supabase } = await authenticateAndCreatePrivilegedClient(request);
    const body = await readJsonObject(request);
    const deviceHash = typeof body.device_hash === 'string' ? body.device_hash.trim() : '';
    const deviceLabel =
      typeof body.device_label === 'string' ? body.device_label.trim() : undefined;

    if (!deviceHash) {
      throw new HttpError(400, 'device_hash is required.');
    }
    if (
      body.device_label !== undefined &&
      (!deviceLabel || typeof body.device_label !== 'string')
    ) {
      throw new HttpError(400, 'device_label must be a non-empty string when provided.');
    }

    const customer = await ensureCustomer(supabase, user);
    const now = new Date();
    const serverTime = now.toISOString();
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('id, valid_until')
      .eq('customer_id', customer.id)
      .eq('status', 'active')
      .lte('valid_from', serverTime)
      .or(`valid_until.is.null,valid_until.gte.${serverTime}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (licenseError) {
      throw licenseError;
    }

    if (license) {
      const { data: existingDevice, error: deviceLookupError } = await supabase
        .from('devices')
        .select('id, revoked_at')
        .eq('license_id', license.id)
        .eq('device_hash', deviceHash)
        .maybeSingle();

      if (deviceLookupError) {
        throw deviceLookupError;
      }

      const deviceValues: Record<string, string | null> = {
        last_seen_at: serverTime,
      };
      if (deviceLabel !== undefined) {
        deviceValues.device_label = deviceLabel;
      }

      if (existingDevice && existingDevice.revoked_at === null) {
        const { error: updateError } = await supabase
          .from('devices')
          .update(deviceValues)
          .eq('id', existingDevice.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { count, error: countError } = await supabase
          .from('devices')
          .select('id', { count: 'exact', head: true })
          .eq('license_id', license.id)
          .is('revoked_at', null);

        if (countError) {
          throw countError;
        }
        if ((count ?? 0) >= 2) {
          return entitlementResponse(
            false,
            'license',
            license.valid_until,
            serverTime,
            'device_limit',
          );
        }

        if (existingDevice) {
          const { error: reactivateError } = await supabase
            .from('devices')
            .update({
              ...deviceValues,
              activated_at: serverTime,
              revoked_at: null,
            })
            .eq('id', existingDevice.id);

          if (reactivateError) {
            throw reactivateError;
          }
        } else {
          const { error: insertError } = await supabase.from('devices').insert({
            ...deviceValues,
            license_id: license.id,
            device_hash: deviceHash,
            device_label: deviceLabel ?? null,
            activated_at: serverTime,
            revoked_at: null,
          });

          if (insertError) {
            if (insertError.code === '23505') {
              const { data: concurrentDevice, error: concurrentLookupError } = await supabase
                .from('devices')
                .select('id')
                .eq('license_id', license.id)
                .eq('device_hash', deviceHash)
                .maybeSingle();

              if (concurrentLookupError) {
                throw concurrentLookupError;
              }
              if (concurrentDevice) {
                const { error: concurrentUpdateError } = await supabase
                  .from('devices')
                  .update({
                    ...deviceValues,
                    activated_at: serverTime,
                    revoked_at: null,
                  })
                  .eq('id', concurrentDevice.id);

                if (concurrentUpdateError) {
                  throw concurrentUpdateError;
                }
              } else {
                throw insertError;
              }
            } else {
              throw insertError;
            }
          }
        }
      }

      return entitlementResponse(true, 'license', license.valid_until, serverTime);
    }

    const { data: trial, error: trialError } = await supabase
      .from('trials')
      .select('ends_at')
      .eq('customer_id', customer.id)
      .eq('status', 'active')
      .gt('ends_at', serverTime)
      .maybeSingle();

    if (trialError) {
      throw trialError;
    }
    if (trial) {
      return entitlementResponse(true, 'trial', trial.ends_at, serverTime);
    }

    return entitlementResponse(false, 'none', null, serverTime);
  } catch (error) {
    return errorResponse(error);
  }
});
