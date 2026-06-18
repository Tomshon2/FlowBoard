function normalizeAuthError(error) {
  if (/already|registered|exists/i.test(error.message || "")) return new Error("Email already in use.");
  return error;
}

function normalizeSupabaseUser(user) {
  if (!user) return null;
  const displayName = user.user_metadata?.display_name || user.user_metadata?.name || "";
  return { id: user.id, email: user.email, displayName };
}

async function getAuthSession() {
  const client = getSupabaseClient();
  if (!client) return { session: null, error: null };
  const { data, error } = await client.auth.getSession();
  return { session: data.session, error };
}

async function signInWithEmailPassword(email, password) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured. Check config.js.");
  return client.auth.signInWithPassword({ email, password });
}

async function signUpWithEmailPassword(email, password, displayName) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured. Check config.js.");
  return client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName }
    }
  });
}

async function signOutFromSupabase() {
  const client = getSupabaseClient();
  await client?.auth.signOut();
}
