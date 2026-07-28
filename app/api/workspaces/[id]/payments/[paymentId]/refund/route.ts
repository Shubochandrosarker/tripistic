import { z } from "zod";
import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createPaymentRefund } from "@/lib/payments/refunds";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; paymentId: string }> };

const refundSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).default("requested_by_customer"),
  idempotencyKey: z.string().min(8).max(120),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, paymentId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can refund payments.");
    }

    const body = await request.json().catch(() => null);
    const data = refundSchema.parse(body);
    const refund = await createPaymentRefund({
      workspaceId: id,
      paymentId,
      userId: user.id,
      amount: data.amount,
      reason: data.reason,
      idempotencyKey: data.idempotencyKey,
    });

    await recordAuditEvent({
      action: "payment_refunded",
      workspaceId: id,
      userId: user.id,
      entityType: "payment_refund",
      entityId: refund.id,
      metadata: { paymentId, amount: refund.amount },
      request,
    });

    return json({ refund });
  } catch (error) {
    return handleApiError(error);
  }
}
