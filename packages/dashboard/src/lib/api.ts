/** Backend origin for API calls.
 *  Local `pnpm dev`: leave unset - Vite proxies /v1 → http://localhost:3001
 *  Production: set VITE_API_URL (or packages/dashboard/.env.production)
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
