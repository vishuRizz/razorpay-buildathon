/**
 * Thin HTTP client for the Aisle Agent Commerce API.
 * Used by the LLM tool-calling agent demo.
 */

function resolveBaseUrl() {
  if (process.env.AISLE_API_URL) {
    return process.env.AISLE_API_URL.replace(/\/$/, '');
  }
  // Vercel provides VERCEL_URL without protocol (e.g. razorpay-aisle-api.vercel.app)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}/v1`;
  }
  return `http://localhost:${process.env.PORT ?? 3001}/v1`;
}

function formatErrorDetail(data, status) {
  const raw = data?.detail ?? data?.error ?? data?.message ?? `HTTP ${status}`;
  if (typeof raw === 'string') {
    if (data?.fields) {
      try {
        return `${raw} · ${JSON.stringify(data.fields)}`;
      } catch {
        return raw;
      }
    }
    return raw;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return `HTTP ${status}`;
  }
}

const BASE_URL = resolveBaseUrl();

async function aisleRequest(method, path, { body, token } = {}) {
  const start = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  const duration_ms = Date.now() - start;

  if (!res.ok) {
    const err = new Error(formatErrorDetail(data, res.status));
    err.status = res.status;
    err.response = data;
    err.duration_ms = duration_ms;
    throw err;
  }

  return { data, duration_ms };
}

module.exports = { aisleRequest, BASE_URL, resolveBaseUrl, formatErrorDetail };
