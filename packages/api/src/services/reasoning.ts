import Anthropic from '@anthropic-ai/sdk';
import { Product, AgentConstraints } from '../types';

// ================================================================
// Reasoning Trace Service — Claude-powered audit explanations
// ================================================================

const FALLBACK = 'Reasoning trace unavailable.';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Generate a 2-3 sentence human-readable trace explaining
 * why the agent selected this product given its task and constraints.
 *
 * Never throws — returns fallback string on any error.
 */
export async function generateTrace(
  agentTask: string,
  productsConsidered: Partial<Product>[],
  selectedProduct: Partial<Product>,
  agentConstraints: Partial<AgentConstraints>
): Promise<string> {
  const start = Date.now();

  const simplifiedProducts = productsConsidered.map((p) => ({
    sku: p.sku,
    name: p.data?.name,
    price: p.data?.price_inr,
    categories: p.data?.categories,
    in_stock: p.in_stock,
  }));

  const prompt = `You are an audit trace generator for an AI shopping agent.
Given the agent's task, the products it considered, and the product it selected, write a 2-3 sentence explanation of the selection reasoning.
Be factual, concise, and reference specific product attributes and constraints.

Agent task: ${agentTask}

Products considered: ${JSON.stringify(simplifiedProducts, null, 2)}

Product selected: ${JSON.stringify({
    sku: selectedProduct.sku,
    name: selectedProduct.data?.name,
    price: selectedProduct.data?.price_inr,
    categories: selectedProduct.data?.categories,
  }, null, 2)}

Agent constraints: ${JSON.stringify(agentConstraints, null, 2)}

Write only the 2-3 sentence explanation. No preamble.`;

  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text.trim() : FALLBACK;

    console.log(`[REASONING] Trace generated (${Date.now() - start}ms)`);
    return text;
  } catch (err) {
    console.error('[REASONING] Claude API error — returning fallback:', err);
    return FALLBACK;
  }
}

/**
 * Generate a trace for a policy block — explains why an agent was blocked.
 * Never throws.
 */
export async function generateBlockTrace(
  agentTask: string,
  blockReason: string,
  rule: string
): Promise<string> {
  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `An AI shopping agent was blocked by a safety policy. Write one clear sentence explaining what happened.
Task: ${agentTask}
Rule violated: ${rule}
Reason: ${blockReason}
Write only the explanation sentence.`,
        },
      ],
    });

    return response.content[0]?.type === 'text'
      ? response.content[0].text.trim()
      : `Agent blocked: ${blockReason}`;
  } catch {
    return `Agent blocked by policy rule ${rule}: ${blockReason}`;
  }
}
