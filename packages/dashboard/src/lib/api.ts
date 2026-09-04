/** Backend origin. Local `pnpm dev` leaves this empty so Vite proxies /v1 → :3001 */
const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const API_BASE =
  fromEnv ||
  (import.meta.env.PROD ? 'https://razorpay-aisle-api.vercel.app' : '');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
