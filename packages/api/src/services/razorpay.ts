import Razorpay from 'razorpay';
import { GatewayError } from '../middleware/errorHandler';

// ================================================================
// Razorpay Service — SDK wrapper with retry + structured logging
// ================================================================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  notes: Record<string, string>;
  created_at: number;
}

interface RazorpayPayment {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  method: string;
  captured: boolean;
  created_at: number;
}

/**
 * Create a Razorpay order with exponential backoff retry.
 * Retries: 1s → 2s → 4s. Throws GatewayError after 3 failures.
 */
export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes: Record<string, string> = {}
): Promise<RazorpayOrder> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    console.log(`[RAZORPAY] createOrder attempt ${attempt}/${maxRetries} | amount: ₹${amountPaise / 100}`);

    try {
      const order = await (razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes,
      }) as Promise<RazorpayOrder>);

      console.log(`[RAZORPAY] createOrder success (${Date.now() - start}ms) | id: ${order.id}`);
      return order;
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[RAZORPAY] createOrder FAILED attempt ${attempt}/${maxRetries} (${duration}ms):`, err);

      if (attempt === maxRetries) {
        throw new GatewayError('Razorpay order creation failed after 3 attempts', err);
      }

      const waitMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.log(`[RAZORPAY] Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }

  // TypeScript: unreachable but needed for type safety
  throw new GatewayError('Razorpay order creation failed');
}

/**
 * Fetch a Razorpay order by ID.
 */
export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  const start = Date.now();
  console.log(`[RAZORPAY] fetchOrder | id: ${orderId}`);
  try {
    const order = await (razorpay.orders.fetch(orderId) as Promise<RazorpayOrder>);
    console.log(`[RAZORPAY] fetchOrder success (${Date.now() - start}ms)`);
    return order;
  } catch (err) {
    console.error(`[RAZORPAY] fetchOrder FAILED:`, err);
    throw new GatewayError(`Failed to fetch Razorpay order ${orderId}`, err);
  }
}

/**
 * Fetch a Razorpay payment by ID.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const start = Date.now();
  console.log(`[RAZORPAY] fetchPayment | id: ${paymentId}`);
  try {
    const payment = await (razorpay.payments.fetch(paymentId) as Promise<RazorpayPayment>);
    console.log(`[RAZORPAY] fetchPayment success (${Date.now() - start}ms)`);
    return payment;
  } catch (err) {
    console.error(`[RAZORPAY] fetchPayment FAILED:`, err);
    throw new GatewayError(`Failed to fetch Razorpay payment ${paymentId}`, err);
  }
}
