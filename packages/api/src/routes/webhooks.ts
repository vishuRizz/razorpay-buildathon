import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import { query, queryOne } from '../db/client';
import { logAudit } from '../services/audit';
import { Order } from '../types';

const router = Router();

/**
 * POST /v1/webhooks/razorpay
 * Receives Razorpay webhook events, validates signature, and processes settlement.
 */
router.post('/razorpay', async (req: Request, res: Response) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET not configured.');
    res.status(500).send('Webhook secret not configured');
    return;
  }

  const signature = req.headers['x-razorpay-signature'] as string;
  const rawBody = (req as any).rawBody;

  if (!signature || !rawBody) {
    res.status(400).send('Missing signature or body');
    return;
  }

  try {
    const isValid = Razorpay.validateWebhookSignature(rawBody, signature, secret);
    if (!isValid) {
      console.warn('[WEBHOOK] Invalid signature detected.');
      res.status(400).send('Invalid signature');
      return;
    }
  } catch (err) {
    console.error('[WEBHOOK] Signature validation error:', err);
    res.status(400).send('Validation error');
    return;
  }

  const event = req.body;
  console.log(`[WEBHOOK] Received event: ${event.event}`);

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const entity = event.payload.payment?.entity || event.payload.order?.entity;
    const razorpayOrderId = entity.order_id || entity.id;

    if (razorpayOrderId) {
      // Find the order in our DB
      const order = await queryOne<Order>(
        `SELECT * FROM orders WHERE razorpay_order_id = $1`,
        [razorpayOrderId]
      );

      if (order) {
        // Update order status
        await query(
          `UPDATE orders SET status = 'PAID' WHERE id = $1`,
          [order.id]
        );

        // Generate an audit log so it streams to the Live Feed
        await logAudit({
          agent_id: order.agent_id,
          merchant_id: order.merchant_id,
          action: 'PAYMENT_SETTLED' as any, // Cast as any if PAYMENT_SETTLED isn't in types yet
          input: { razorpay_order_id: razorpayOrderId, event: event.event },
          output: { order_id: order.id, status: 'PAID' },
          duration_ms: 0,
        });

        console.log(`[WEBHOOK] Order ${order.id} marked as PAID via ${event.event}`);
      } else {
        console.warn(`[WEBHOOK] Order with Razorpay ID ${razorpayOrderId} not found.`);
      }
    }
  }

  res.status(200).send('OK');
});

export default router;
