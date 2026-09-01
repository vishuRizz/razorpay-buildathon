/**
 * OpenAI-compatible tool definitions + executors for the Aisle shopping agent.
 */

const { aisleRequest } = require('./aisle_client');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'discover_stores',
      description:
        'List registered stores on Aisle. Use filters to find stores that accept AI buyers and sell relevant categories.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Product category filter, e.g. travel, electronics, connectivity',
          },
          ai_buyers_enabled: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Set to "true" to only return stores that accept AI buyers',
          },
          q: {
            type: 'string',
            description: 'Search store name or description',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_store_manifest',
      description:
        'Read a store manifest: policies (max order value, human review threshold), payment methods, and catalog endpoint.',
      parameters: {
        type: 'object',
        properties: {
          store_id: { type: 'string', description: 'Store ID from discover_stores' },
        },
        required: ['store_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_catalog',
      description:
        'Search products in a store catalog. Always filter by budget using max_price. Compare results across multiple stores before deciding.',
      parameters: {
        type: 'object',
        properties: {
          store_id: { type: 'string' },
          category: { type: 'string' },
          in_stock: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Set to "true" to only see in-stock items',
          },
          max_price: { type: 'integer', description: 'Maximum price in INR' },
          q: { type: 'string', description: 'Keyword search on name, description, tags' },
        },
        required: ['store_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_cart',
      description:
        'Add items to cart at a store. Runs the Policy Engine — may block if limits are exceeded. Call only after choosing the best store and product.',
      parameters: {
        type: 'object',
        properties: {
          store_id: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
              required: ['sku', 'quantity'],
            },
            minItems: 1,
          },
          agent_task: {
            type: 'string',
            description: 'Human-readable description of what you are trying to buy and why',
          },
        },
        required: ['store_id', 'items', 'agent_task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkout',
      description:
        'Initiate Razorpay checkout for a cart. Requires agent_confirm: true. Include clear reasoning for the purchase decision.',
      parameters: {
        type: 'object',
        properties: {
          store_id: { type: 'string' },
          cart_id: { type: 'string' },
          payment_method: {
            type: 'string',
            enum: ['razorpay_upi', 'razorpay_card', 'razorpay_netbanking'],
          },
          agent_reasoning: {
            type: 'string',
            description: 'Why you chose this product and store over alternatives',
          },
          agent_task: { type: 'string' },
        },
        required: ['store_id', 'cart_id', 'agent_reasoning', 'agent_task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_order_status',
      description: 'Poll order status after checkout (CREATED, PAID, PENDING_REVIEW, etc.)',
      parameters: {
        type: 'object',
        properties: {
          store_id: { type: 'string' },
          order_id: { type: 'string' },
        },
        required: ['store_id', 'order_id'],
      },
    },
  },
];

/** Small models often emit "3000" strings — coerce before API calls. */
function normalizeToolArgs(args) {
  const out = { ...args };
  if (out.max_price != null) out.max_price = Number(out.max_price);
  if (Array.isArray(out.items)) {
    out.items = out.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
    }));
  }
  return out;
}

function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  }
  const query = qs.toString();
  return query ? `?${query}` : '';
}

async function executeTool(name, rawArgs, ctx) {
  const args = normalizeToolArgs(rawArgs);
  const { token } = ctx;

  switch (name) {
    case 'discover_stores': {
      const query = buildQuery({
        category: args.category,
        ai_buyers_enabled: args.ai_buyers_enabled,
        q: args.q,
      });
      const { data, duration_ms } = await aisleRequest('GET', `/stores${query}`, { token });
      return { ok: true, duration_ms, ...data };
    }

    case 'read_store_manifest': {
      const { data, duration_ms } = await aisleRequest(
        'GET',
        `/stores/${args.store_id}/manifest`,
        { token }
      );
      return { ok: true, duration_ms, manifest: data };
    }

    case 'search_catalog': {
      const query = buildQuery({
        category: args.category,
        in_stock: args.in_stock,
        max_price: args.max_price,
        q: args.q,
      });
      const { data, duration_ms } = await aisleRequest(
        'GET',
        `/stores/${args.store_id}/catalog${query}`,
        { token }
      );
      return { ok: true, duration_ms, ...data };
    }

    case 'create_cart': {
      const { data, duration_ms } = await aisleRequest(
        'POST',
        `/stores/${args.store_id}/cart`,
        {
          token,
          body: {
            items: args.items,
            agent_task: args.agent_task,
          },
        }
      );
      return { ok: true, duration_ms, ...data };
    }

    case 'checkout': {
      const { data, duration_ms } = await aisleRequest(
        'POST',
        `/stores/${args.store_id}/cart/${args.cart_id}/checkout`,
        {
          token,
          body: {
            payment_method: args.payment_method ?? 'razorpay_upi',
            agent_confirm: true,
            agent_reasoning: args.agent_reasoning,
            agent_task: args.agent_task,
          },
        }
      );
      return { ok: true, duration_ms, ...data };
    }

    case 'check_order_status': {
      const { data, duration_ms } = await aisleRequest(
        'GET',
        `/stores/${args.store_id}/orders/${args.order_id}/status`,
        { token }
      );
      return { ok: true, duration_ms, ...data };
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
