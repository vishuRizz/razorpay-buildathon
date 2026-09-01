const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env' });

const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_secret';

const orderId = process.argv[2];
if (!orderId) {
  console.error("Usage: node mock_webhook.js <razorpay_order_id>");
  process.exit(1);
}

const payload = {
  entity: "event",
  account_id: "acc_J2y",
  event: "payment.captured",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_xyz",
        entity: "payment",
        amount: 99900,
        currency: "INR",
        status: "captured",
        order_id: orderId,
        method: "card",
        captured: true,
      }
    }
  },
  created_at: Math.floor(Date.now() / 1000)
};

const bodyString = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');

console.log("Sending webhook to localhost:3001 with order_id:", orderId);

fetch('http://localhost:3001/v1/webhooks/razorpay', {
  method: 'POST',
  body: bodyString,
  headers: {
    'x-razorpay-signature': signature,
    'Content-Type': 'application/json'
  }
}).then(async res => {
  console.log("Response:", res.status, await res.text());
}).catch(err => {
  console.error("Error:", err.message);
});
