import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';
import { validate } from '../middleware/validate';
import { logAudit } from '../services/audit';
import { Order } from '../types';

const router = Router();

const SettleSchema = z.object({
  razorpay_order_id: z.string().min(5),
  payment_id: z.string().optional(),
});

/**
 * Mark an AISLE order PAID after Razorpay payment.captured / order.paid
 * (or demo settlement). Shared by webhook + demo settle endpoint.
 */
export async function settleRazorpayOrder(input: {
  razorpay_order_id: string;
  payment_id?: string;
  event?: string;
  source?: 'webhook' | 'demo';
}): Promise<{ ok: boolean; order_id?: string; already_paid?: boolean; detail?: string }> {
  const order = await queryOne<Order>(
    `SELECT * FROM orders WHERE razorpay_order_id = $1`,
    [input.razorpay_order_id]
  );

  if (!order) {
    return { ok: false, detail: `No AISLE order for Razorpay id ${input.razorpay_order_id}` };
  }

  if (order.status === 'PAID') {
    return { ok: true, order_id: order.id, already_paid: true };
  }

  const paymentId = input.payment_id ?? `pay_demo_${nanoid(10)}`;

  await query(
    `UPDATE orders
     SET status = 'PAID',
         razorpay_payment_id = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [paymentId, order.id]
  );

  await logAudit({
    agent_id: order.agent_id,
    merchant_id: order.merchant_id,
    action: 'PAYMENT_SETTLED' as any,
    input: {
      razorpay_order_id: input.razorpay_order_id,
      razorpay_payment_id: paymentId,
      event: input.event ?? 'payment.captured',
      source: input.source ?? 'webhook',
    },
    output: { order_id: order.id, status: 'PAID', amount_inr: order.amount_inr },
    duration_ms: 0,
  });

  console.log(
    `[RAZORPAY SETTLE] Order ${order.id} → PAID via ${input.source ?? 'webhook'} (${input.event ?? 'payment.captured'})`
  );

  return { ok: true, order_id: order.id };
}

/**
 * POST /v1/demo/razorpay/settle
 * Demo-only: simulate payment.captured for a Razorpay order created by AISLE.
 * Same end-state as a real Razorpay webhook - useful for local / pitch demos.
 */
router.post('/razorpay/settle', validate(SettleSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof SettleSchema>;
  const result = await settleRazorpayOrder({
    razorpay_order_id: body.razorpay_order_id,
    payment_id: body.payment_id,
    event: 'payment.captured',
    source: 'demo',
  });

  if (!result.ok) {
    res.status(404).json({ error: 'NOT_FOUND', detail: result.detail });
    return;
  }

  res.json({
    ok: true,
    order_id: result.order_id,
    status: 'PAID',
    already_paid: Boolean(result.already_paid),
    message: result.already_paid
      ? 'Order was already PAID'
      : 'Simulated payment.captured - order marked PAID (same path as Razorpay webhook)',
  });
});

export default router;
