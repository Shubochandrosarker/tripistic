import { prisma } from "@/lib/db";
import { conflict, handleApiError, json } from "@/lib/api";
import { hashPassword } from "@/lib/auth/passwords";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { registerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw conflict("An account with this email already exists. Try signing in instead.");
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
      },
    });

    await recordAuditEvent({
      action: "user_registered",
      userId: user.id,
      entityType: "user",
      entityId: user.id,
      request,
    });

    return json({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
