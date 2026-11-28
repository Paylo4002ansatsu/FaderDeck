import {
  authenticateAndCreatePrivilegedClient,
  ensureCustomer,
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from '../_shared/auth.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const { user, supabase } = await authenticateAndCreatePrivilegedClient(request);
    const body = await readJsonObject(request);
    if (body.device_hash === undefined) {
      return jsonResponse({
        pending_device_validation: true,
        message: 'Trial activation requires validation of this computer.',
      }, 202);
    }
    const machineId = typeof body.device_hash === 'string' ? body.device_hash.trim() : '';
    const label = typeof body.device_label === 'string' ? body.device_label.trim() : null;
    if (!/^[0-9a-f]{64}$/.test(machineId)) {
      throw new HttpError(400, 'device_hash must be a SHA-256 hash.');
    }
    if (body.device_label !== undefined && (!label || label.length > 255)) {
      throw new HttpError(400, 'device_label must contain between 1 and 255 characters.');
    }
    const customer = await ensureCustomer(supabase, user);
    const { data, error } = await supabase.rpc('validate_device_entitlement', {
      p_customer_id: customer.id,
      p_machine_id: machineId,
      p_device_label: label,
      p_reactivate: false,
    });
    if (error) throw error;
    return jsonResponse({ entitlement: data });
  } catch (error) {
    return errorResponse(error);
  }
});
