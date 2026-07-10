import { cookies } from "next/headers";
import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

/** Set the caller's active workspace (validated against membership). */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
