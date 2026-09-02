const API_BASE = process.env.AISLE_API_URL ?? 'http://localhost:3001/v1';
const AIT_TOKEN = process.env.AISLE_AIT_TOKEN ?? '';

export async function aisleRequest(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {}
): Promise<{ data: unknown; status: number }> {
  const token = options.token ?? AIT_TOKEN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`AISLE API ${method} ${path} → ${res.status}: ${text}`);
  }

  return { data, status: res.status };
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const q = qs.toString();
  return q ? `?${q}` : '';
}
