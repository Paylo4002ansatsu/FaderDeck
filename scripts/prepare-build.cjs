'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadPublicSupabaseEnv } = require('../bridge/supabase-client.cjs');

function prepareBuild() {
  loadPublicSupabaseEnv();
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!url || !anonKey) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_ANON_KEY before building.');
  }
  if (anonKey.startsWith('sb_secret_')) {
    throw new Error('A secret Supabase key must never be embedded in the app.');
  }
  const jwtParts = anonKey.split('.');
  if (jwtParts.length === 3) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
    } catch (error) {
      throw new Error('The Supabase JWT key is invalid.', { cause: error });
    }
    if (payload.role !== 'anon') throw new Error('Only the Supabase anon key may be embedded.');
  }
  const destination = path.join(__dirname, '..', 'bridge', 'runtime-config.generated.cjs');
  fs.writeFileSync(
    destination,
    `'use strict';\nmodule.exports = ${JSON.stringify({ url, anonKey })};\n`,
  );
}

if (require.main === module) prepareBuild();
module.exports = { prepareBuild };
