#!/usr/bin/env node
/**
 * AISLE MCP Server
 * Exposes commerce tools for any MCP-compatible agent (Cursor, Claude Desktop, Codex).
 *
 * Env:
 *   AISLE_API_URL   - default http://localhost:3001/v1
 *   AISLE_AIT_TOKEN - Agent Identity Token (required for cart/checkout)
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { aisleRequest, buildQuery } from './aisleClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

const TOOLS = [
  {
    name: 'aisle_discover_stores',
    description:
      'List registered stores on AISLE. Filter by category, AI buyer support, or keyword search.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'e.g. travel, electronics, connectivity' },
        ai_buyers_enabled: { type: 'string', enum: ['true', 'false'] },
        q: { type: 'string', description: 'Search store name or description' },
      },
    },
  },
  {
    name: 'aisle_read_manifest',
    description: 'Read store manifest: policies, payment methods, catalog endpoint.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        store_id: { type: 'string' },
      },
      required: ['store_id'],
    },
  },
  {
    name: 'aisle_search_catalog',
    description:
      'Semantic product search. Use natural language q like "lightweight 4G hotspot for beach trip".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        store_id: { type: 'string' },
        q: { type: 'string', description: 'Natural language search query' },
        category: { type: 'string' },
        in_stock: { type: 'string', enum: ['true', 'false'] },
        max_price: { type: 'integer' },
        search_mode: { type: 'string', enum: ['keyword', 'semantic', 'hybrid'] },
      },
      required: ['store_id'],
    },
  },
  {
    name: 'aisle_suggest_upsell',
    description:
      'Merchant growth agent - get complementary product suggestions for cart SKUs (e.g. adapter with WiFi).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        store_id: { type: 'string' },
        cart_skus: {
          type: 'array',
          items: { type: 'string' },
          description: 'SKUs currently in cart',
        },
      },
      required: ['store_id', 'cart_skus'],
    },
  },
  {
    name: 'aisle_create_cart',
    description: 'Create cart with items. Runs Policy Engine. Returns upsell suggestions.',
    inputSchema: {
      type: 'object' as const,
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
        },
        agent_task: { type: 'string' },
      },
      required: ['store_id', 'items', 'agent_task'],
    },
  },
  {
    name: 'aisle_negotiate_discount',
    description:
      'Negotiate discount with merchant. Auto-applies coupon if within discount_cap_percent policy.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        store_id: { type: 'string' },
        cart_id: { type: 'string' },
        requested_discount_percent: { type: 'number', minimum: 0, maximum: 100 },
        agent_reasoning: { type: 'string' },
      },
      required: ['store_id', 'cart_id', 'requested_discount_percent'],
    },
  },
  {
    name: 'aisle_checkout',
    description: 'Initiate Razorpay checkout for a cart.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        store_id: { type: 'string' },
        cart_id: { type: 'string' },
        payment_method: {
          type: 'string',
          enum: ['razorpay_upi', 'razorpay_card', 'razorpay_netbanking'],
        },
        agent_reasoning: { type: 'string' },
        agent_task: { type: 'string' },
      },
      required: ['store_id', 'cart_id', 'agent_reasoning'],
    },
  },
  {
    name: 'aisle_check_order_status',
    description: 'Poll order status after checkout.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        store_id: { type: 'string' },
        order_id: { type: 'string' },
      },
      required: ['store_id', 'order_id'],
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'aisle_discover_stores': {
      const query = buildQuery({
        category: args.category as string | undefined,
        ai_buyers_enabled: args.ai_buyers_enabled as string | undefined,
        q: args.q as string | undefined,
      });
      const { data } = await aisleRequest('GET', `/stores${query}`);
      return data;
    }
    case 'aisle_read_manifest': {
      const { data } = await aisleRequest('GET', `/stores/${args.store_id}/manifest`);
      return data;
    }
    case 'aisle_search_catalog': {
      const query = buildQuery({
        q: args.q as string | undefined,
        category: args.category as string | undefined,
        in_stock: args.in_stock as string | undefined,
        max_price: args.max_price as number | undefined,
        search_mode: args.search_mode as string | undefined,
      });
      const { data } = await aisleRequest('GET', `/stores/${args.store_id}/catalog${query}`);
      return data;
    }
    case 'aisle_suggest_upsell': {
      const skus = (args.cart_skus as string[]).join(',');
      const { data } = await aisleRequest(
        'GET',
        `/stores/${args.store_id}/catalog/upsell?cart_skus=${encodeURIComponent(skus)}`
      );
      return data;
    }
    case 'aisle_create_cart': {
      const { data } = await aisleRequest('POST', `/stores/${args.store_id}/cart`, {
        body: { items: args.items, agent_task: args.agent_task },
      });
      return data;
    }
    case 'aisle_negotiate_discount': {
      const { data } = await aisleRequest(
        'POST',
        `/stores/${args.store_id}/cart/${args.cart_id}/negotiate`,
        {
          body: {
            requested_discount_percent: args.requested_discount_percent,
            agent_reasoning: args.agent_reasoning,
          },
        }
      );
      return data;
    }
    case 'aisle_checkout': {
      const { data } = await aisleRequest(
        'POST',
        `/stores/${args.store_id}/cart/${args.cart_id}/checkout`,
        {
          body: {
            payment_method: args.payment_method ?? 'razorpay_upi',
            agent_confirm: true,
            agent_reasoning: args.agent_reasoning,
            agent_task: args.agent_task,
          },
        }
      );
      return data;
    }
    case 'aisle_check_order_status': {
      const { data } = await aisleRequest(
        'GET',
        `/stores/${args.store_id}/orders/${args.order_id}/status`
      );
      return data;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function main() {
  const server = new Server(
    { name: 'aisle-commerce', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await executeTool(
        request.params.name,
        (request.params.arguments ?? {}) as Record<string, unknown>
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AISLE MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal MCP error:', err);
  process.exit(1);
});
