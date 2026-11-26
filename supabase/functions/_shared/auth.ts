import {
  createClient,
  type SupabaseClient,
  type User,
} from 'https://esm.sh/@supabase/supabase-js@2';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message }, error.status);
  }

  console.error('Edge Function failed', error);
  return jsonResponse({ error: 'Internal server error' }, 500);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }

  if (!isJsonObject(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  return body;
}

export async function authenticateRequest(request: Request): Promise<User> {
  const authorization = request.headers.get('Authorization');
  const tokenMatch = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!tokenMatch) {
    throw new HttpError(401, 'A valid Bearer token is required.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !publicKey) {
    throw new Error('SUPABASE_URL and a publishable/anon key must be configured.');
  }

  const supabase = createClient(supabaseUrl, publicKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${tokenMatch[1]}` },
    },
  });
  const { data, error } = await supabase.auth.getUser(tokenMatch[1]);

  if (error || !data.user) {
    throw new HttpError(401, 'The Bearer token is invalid or expired.');
  }

  return data.user;
}

function createPrivilegedClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !secretKey) {
    throw new Error('SUPABASE_URL and a server-only Supabase secret key must be configured.');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function authenticateAndCreatePrivilegedClient(
  request: Request,
): Promise<{ user: User; supabase: SupabaseClient }> {
  const user = await authenticateRequest(request);
  return { user, supabase: createPrivilegedClient() };
}

export async function ensureCustomer(
  supabase: SupabaseClient,
  user: User,
): Promise<{ id: string; auth_user_id: string; email: string }> {
  const email = user.email?.trim().toLowerCase();

  if (!email) {
    throw new HttpError(400, 'The authenticated user must have an email address.');
  }

  const { data: linkedCustomer, error: linkedLookupError } = await supabase
    .from('customers')
    .select('id, auth_user_id, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (linkedLookupError) {
    throw linkedLookupError;
  }

  if (linkedCustomer) {
    if (linkedCustomer.email === email) {
      return linkedCustomer;
    }

    const { data, error } = await supabase
      .from('customers')
      .update({ email })
      .eq('id', linkedCustomer.id)
      .select('id, auth_user_id, email')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new HttpError(409, 'This email address is linked to another customer.');
      }
      throw error;
    }

    return data;
  }

  const { data: emailCustomer, error: emailLookupError } = await supabase
    .from('customers')
    .select('id, auth_user_id, email')
    .eq('email', email)
    .maybeSingle();

  if (emailLookupError) {
    throw emailLookupError;
  }

  if (emailCustomer) {
    if (emailCustomer.auth_user_id && emailCustomer.auth_user_id !== user.id) {
      throw new HttpError(409, 'This email address is linked to another customer.');
    }

    if (emailCustomer.auth_user_id === user.id) {
      return emailCustomer;
    }

    const { data, error } = await supabase
      .from('customers')
      .update({ auth_user_id: user.id, email })
      .eq('id', emailCustomer.id)
      .is('auth_user_id', null)
      .select('id, auth_user_id, email')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }

    const { data: concurrentCustomer, error: concurrentLookupError } = await supabase
      .from('customers')
      .select('id, auth_user_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (concurrentLookupError) {
      throw concurrentLookupError;
    }
    if (concurrentCustomer) {
      return concurrentCustomer;
    }
    throw new HttpError(409, 'The customer record could not be linked to this user.');
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ auth_user_id: user.id, email })
    .select('id, auth_user_id, email')
    .single();

  if (!error) {
    return data;
  }

  if (error.code === '23505') {
    const { data: concurrentCustomer, error: concurrentLookupError } = await supabase
      .from('customers')
      .select('id, auth_user_id, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (concurrentLookupError) {
      throw concurrentLookupError;
    }
    if (concurrentCustomer) {
      return concurrentCustomer;
    }
    throw new HttpError(409, 'This email address is linked to another customer.');
  }

  throw error;
}
