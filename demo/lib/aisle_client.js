/**
 * Thin HTTP client for the Aisle Agent Commerce API.
 * Used by the LLM tool-calling agent demo.
 */

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;

async function aisleRequest(method, path, { body, token } = {}) {
  const start = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  const duration_ms = Date.now() - start;

  if (!res.ok) {
    const err = new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.response = data;
    err.duration_ms = duration_ms;
    throw err;
  }

  return { data, duration_ms };
}

module.exports = { aisleRequest, BASE_URL };
