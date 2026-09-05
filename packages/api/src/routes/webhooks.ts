import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import { settleRazorpayOrder } from './demoSettle';

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
    const razorpayOrderId = entity?.order_id || entity?.id;
    const paymentId = event.payload.payment?.entity?.id;

    if (razorpayOrderId) {
      const result = await settleRazorpayOrder({
        razorpay_order_id: razorpayOrderId,
        payment_id: paymentId,
        event: event.event,
        source: 'webhook',
      });
      if (!result.ok) {
        console.warn(`[WEBHOOK] ${result.detail}`);
      }
    }
  }

  res.status(200).send('OK');
});

export default router;
