/** In-memory cancel flags for background LLM agent jobs. */
const cancelRequested = new Set<string>();

export function requestAgentCancel(sessionId: string): void {
  cancelRequested.add(sessionId);
}

export function isAgentCancelRequested(sessionId: string): boolean {
  return cancelRequested.has(sessionId);
}

export function clearAgentCancel(sessionId: string): void {
  cancelRequested.delete(sessionId);
}
