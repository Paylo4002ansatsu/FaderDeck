import {
  authenticateAndCreatePrivilegedClient,
  ensureCustomer,
  errorResponse,
  jsonResponse,
} from '../_shared/auth.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const { user, supabase } = await authenticateAndCreatePrivilegedClient(request);
    const customer = await ensureCustomer(supabase, user);
    const { data: existingTrial, error: lookupError } = await supabase
      .from('trials')
      .select('id, customer_id, starts_at, ends_at, status')
      .eq('customer_id', customer.id)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    if (existingTrial) {
      return jsonResponse({ trial: existingTrial });
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data: trial, error: insertError } = await supabase
      .from('trials')
      .insert({
        customer_id: customer.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'active',
      })
      .select('id, customer_id, starts_at, ends_at, status')
      .single();

    if (!insertError) {
      return jsonResponse({ trial }, 201);
    }

    if (insertError.code === '23505') {
      const { data: concurrentTrial, error: concurrentLookupError } = await supabase
        .from('trials')
        .select('id, customer_id, starts_at, ends_at, status')
        .eq('customer_id', customer.id)
        .single();

      if (concurrentLookupError) {
        throw concurrentLookupError;
      }
      return jsonResponse({ trial: concurrentTrial });
    }

    throw insertError;
  } catch (error) {
    return errorResponse(error);
  }
});
