import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useApp } from '../App';
import StatusBadge from '../components/StatusBadge';
import AuditDrawer from '../components/AuditDrawer';

interface LogEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  merchant_id: string;
  action: string;
  input: unknown;
  output: unknown;
  reasoning: string;
  policy_result: unknown;
  duration_ms: number;
  error: string;
}

const ACTION_LABELS: Record<string, string> = {
  ADD_TO_CART: 'Add to Cart',
  CHECKOUT_SUCCESS: 'Checkout',
  CHECKOUT_FAILED: 'Checkout Failed',
  POLICY_BLOCK: 'Policy Block',
  DISCOVER: 'Store Discovery',
  CATALOG_QUERY: 'Catalog Query',
  MANIFEST_READ: 'Manifest Read',
  CART_ABANDON: 'Cart Abandoned',
  HUMAN_REVIEW_REQUESTED: 'Pending Review',
  HUMAN_REVIEW_APPROVED: 'Review Approved',
  HUMAN_REVIEW_REJECTED: 'Review Rejected',
  ORDER_STATUS: 'Status Poll',
};

export default function LiveFeed() {
  const { merchantId, setPendingCount } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    if (!merchantId) return;
    try {
      const { data } = await axios.get(`/v1/merchants/${merchantId}/logs?limit=100`);
      setLogs(data.logs ?? []);
      const pending = (data.logs ?? []).filter(
        (l: LogEntry) => l.action === 'HUMAN_REVIEW_REQUESTED'
      ).length;
      setPendingCount(pending);
      setLastRefresh(new Date());
      setError('');
    } catch (err: unknown) {
      setError('Failed to load logs. Check merchant ID and API connection.');
    }
  }, [merchantId, setPendingCount]);

  useEffect(() => {
    fetchLogs();
    if (!isLive) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs, isLive]);

  const rowColor = (action: string) => {
    if (['CHECKOUT_SUCCESS', 'HUMAN_REVIEW_APPROVED'].includes(action)) return 'border-l-2 border-l-status-approved/50';
    if (['HUMAN_REVIEW_REQUESTED'].includes(action)) return 'border-l-2 border-l-status-pending/50';
    if (['POLICY_BLOCK', 'CHECKOUT_FAILED', 'HUMAN_REVIEW_REJECTED'].includes(action)) return 'border-l-2 border-l-status-blocked/50';
    return 'border-l-2 border-l-transparent';
  };

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in">
          <div className="text-5xl mb-4">🤖</div>
          <h2 className="text-xl font-bold text-white mb-2">Enter Merchant ID</h2>
          <p className="text-gray-400">Set your Merchant ID in the sidebar to start monitoring agent activity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-bg-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              ⚡ Live Agent Feed
              {isLive && (
                <span className="flex items-center gap-1.5 text-sm font-normal text-status-approved">
                  <span className="w-2 h-2 rounded-full bg-status-approved live-dot" />
                  LIVE
                </span>
              )}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Real-time AI agent activity · Last refresh: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              id="toggle-live"
              onClick={() => setIsLive(!isLive)}
              className={`btn-ghost text-sm ${isLive ? 'text-status-approved' : ''}`}
            >
              {isLive ? '⏸ Pause' : '▶ Resume'}
            </button>
            <button id="refresh-logs" onClick={fetchLogs} className="btn-ghost text-sm">
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-4">
          {[
            { label: 'Total Events', value: logs.length, color: 'text-brand-light' },
            { label: 'Approved', value: logs.filter(l => ['CHECKOUT_SUCCESS', 'HUMAN_REVIEW_APPROVED'].includes(l.action)).length, color: 'text-status-approved' },
            { label: 'Pending Review', value: logs.filter(l => l.action === 'HUMAN_REVIEW_REQUESTED').length, color: 'text-status-pending' },
            { label: 'Blocked', value: logs.filter(l => ['POLICY_BLOCK', 'CHECKOUT_FAILED'].includes(l.action)).length, color: 'text-status-blocked' },
          ].map((stat) => (
            <div key={stat.label} className="card py-3 px-4 flex-1">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-status-blocked/10 border border-status-blocked/20 rounded-lg text-status-blocked text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">📭</div>
              <p>No agent activity yet. Run a demo script to see live events.</p>
              <code className="text-xs mt-2 block text-gray-600">node demo/agent_travel.js</code>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-surface/90 backdrop-blur-sm z-10">
              <tr className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                <th className="text-left px-6 py-3">Timestamp</th>
                <th className="text-left px-4 py-3">Agent ID</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Reasoning</th>
                <th className="px-4 py-3">ms</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  id={`log-row-${log.id}`}
                  onClick={() => setSelected(log)}
                  className={`table-row ${rowColor(log.action)}`}
                >
                  <td className="px-6 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[120px] truncate">
                    {log.agent_id ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-200">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    {(() => {
                      const out = log.output as Record<string, unknown> | null;
                      const amount = out?.amount_inr ?? out?.subtotal_inr;
                      return amount ? `₹${amount}` : '—';
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.action} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                    {log.reasoning ? log.reasoning.slice(0, 60) + '...' : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs text-center font-mono">
                    {log.duration_ms ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Drawer */}
      {selected && <AuditDrawer log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
