import { getViewer, isAuthConfigured } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/** GET /api/me — who the viewer is and which optional features are enabled. */
export async function GET(): Promise<Response> {
  const viewer = await getViewer();
  return Response.json({
    email: viewer.email,
    isAdmin: viewer.isAdmin,
    features: {
      history: isDbConfigured(),
      email: isEmailConfigured(),
      signIn: isAuthConfigured() && isDbConfigured() && isEmailConfigured(),
    },
  });
}
