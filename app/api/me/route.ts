import { isGoogleConfigured } from "@/lib/auth/google";
import { getViewer, isAuthConfigured } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/** GET /api/me — who the viewer is and which optional features are enabled. */
export async function GET(): Promise<Response> {
  const viewer = await getViewer();
  return Response.json({
    email: viewer.email,
    name: viewer.name ?? null,
    picture: viewer.picture ?? null,
    isAdmin: viewer.isAdmin,
    features: {
      history: isDbConfigured(),
      email: isEmailConfigured(),
      googleSignIn: isAuthConfigured() && isGoogleConfigured(),
      emailSignIn: isAuthConfigured() && isDbConfigured() && isEmailConfigured(),
      signIn: isAuthConfigured() && (isGoogleConfigured() || (isDbConfigured() && isEmailConfigured())),
    },
  });
}
