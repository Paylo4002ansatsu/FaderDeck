import {
  authenticateAndCreatePrivilegedClient,
  ensureCustomer,
  errorResponse,
  jsonResponse,
} from '../_shared/auth.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    const { user, supabase } = await authenticateAndCreatePrivilegedClient(request);
    const customer = await ensureCustomer(supabase, user);
    const now = new Date();
    const serverTime = now.toISOString();
    const { data: trial, error: lookupError } = await supabase
      .from('trials')
      .select('id, customer_id, starts_at, ends_at, status')
      .eq('customer_id', customer.id)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    if (!trial) {
      return jsonResponse({
        active: false,
        expired: false,
        server_time: serverTime,
        trial: null,
      });
    }

    const expired = now.getTime() >= Date.parse(trial.ends_at);
    let currentTrial = trial;

    if (expired && (trial.status === 'active' || trial.status === 'pending')) {
      const { data: updatedTrial, error: updateError } = await supabase
        .from('trials')
        .update({ status: 'expired' })
        .eq('id', trial.id)
        .select('id, customer_id, starts_at, ends_at, status')
        .single();

      if (updateError) {
        throw updateError;
      }
      currentTrial = updatedTrial;
    }

    return jsonResponse({
      active: currentTrial.status === 'active' && now.getTime() < Date.parse(currentTrial.ends_at),
      expired,
      server_time: serverTime,
      trial: currentTrial,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
