// The proxy redirects a signed-out visitor before any /dashboard page runs, so
// these pages no longer spend a round trip on auth.getUser() just to repeat
// that check and to filter by a user_id that RLS already enforces.
//
// What is left is the session that dies between the proxy and the query.
// PostgREST answers that with an error rather than an empty list, and a page
// showing "permission denied" would be a poor way to say "reconnecte-toi".
export function isAuthFailure(error: { code?: string } | null | undefined) {
  if (!error?.code) return false;
  // 42501: the role holds no privilege — an anonymous request.
  // PGRST301: the JWT is expired or malformed.
  return error.code === "42501" || error.code === "PGRST301";
}
