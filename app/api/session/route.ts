import { cookies } from "next/headers";
import { handleApiError, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/constants";

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return json({ authenticated: false });
    }
    const cookieStore = await cookies();
    return json({
      authenticated: true,
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        isPlatformAdmin: sessionUser.isPlatformAdmin,
      },
      activeWorkspaceId: cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
