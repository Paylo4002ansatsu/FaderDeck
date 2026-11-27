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
    if (typeof body.machineId !== 'string' || !/^[0-9a-f]{64}$/.test(body.machineId)) {
      throw new HttpError(400, 'machineId must be a SHA-256 hash.');
    }
    const customer = await ensureCustomer(supabase, user);
    const { data, error } = await supabase.rpc('remove_license_device', {
      p_customer_id: customer.id,
      p_machine_id: body.machineId,
    });
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Device not found.');
    return jsonResponse({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
});
