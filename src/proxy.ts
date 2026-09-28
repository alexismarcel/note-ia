import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// Was every path but static assets, which put a Supabase auth round trip in
// front of the landing page, the login page and both API routes — the API
// routes authenticate the caller themselves, and the public pages have nobody
// to authenticate. Only /dashboard needs the session refreshed and the
// signed-out redirect.
export const config = {
  matcher: ["/dashboard/:path*"],
};
