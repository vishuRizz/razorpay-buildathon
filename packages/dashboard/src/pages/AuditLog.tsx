import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useApp } from '../App';
import StatusBadge from '../components/StatusBadge';
import AuditDrawer from '../components/AuditDrawer';

interface LogEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  action: string;
  input: unknown;
  output: unknown;
  reasoning: string;
  policy_result: unknown;
  duration_ms: number;
  error: string;
}

const ACTIONS = [
  'ALL', 'ADD_TO_CART', 'CHECKOUT_SUCCESS', 'CHECKOUT_FAILED', 'POLICY_BLOCK',
  'DISCOVER', 'CATALOG_QUERY', 'HUMAN_REVIEW_REQUESTED', 'HUMAN_REVIEW_APPROVED',
];

export default function AuditLog() {
  const { merchantId } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [filters, setFilters] = useState({
    action: 'ALL',
    agent_id: '',
    from: '',
    to: '',
    policy_failed: false,
  });
  const PAGE_SIZE = 50;

  const fetchLogs = useCallback(async () => {
    if (!merchantId) return;
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };
    if (filters.action !== 'ALL') params.action = filters.action;
    if (filters.agent_id) params.agent_id = filters.agent_id;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.policy_failed) params.policy_failed = 'true';

    const { data } = await axios.get(`/v1/merchants/${merchantId}/logs`, { params });
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
  }, [merchantId, page, filters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const exportCsv = () => {
    const headers = ['id', 'timestamp', 'agent_id', 'action', 'duration_ms', 'error'];
    const rows = logs.map((l) =>
      headers.map((h) => JSON.stringify((l as any)[h] ?? '')).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aisle-audit-${merchantId}-${Date.now()}.csv`;
    a.click();
  };

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-white mb-2">Enter Merchant ID</h2>
          <p className="text-gray-400">Set your Merchant ID in the sidebar first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-bg-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">📋 Audit Log Explorer</h1>
            <p className="text-gray-400 text-sm mt-1">{total} total entries</p>
          </div>
          <button id="export-csv" onClick={exportCsv} className="btn-ghost text-sm">
            ⬇ Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            id="filter-action"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="input-field text-sm"
          >
            {ACTIONS.map((a) => <option key={a} value={a}>{a === 'ALL' ? 'All Actions' : a}</option>)}
          </select>

          <input
            id="filter-agent-id"
            className="input-field text-sm font-mono w-48"
            placeholder="Agent ID..."
            value={filters.agent_id}
            onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}
          />

          <input
            id="filter-from"
            type="datetime-local"
            className="input-field text-sm"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
          <input
            id="filter-to"
            type="datetime-local"
            className="input-field text-sm"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />

          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              id="filter-policy-failed"
              type="checkbox"
              checked={filters.policy_failed}
              onChange={(e) => setFilters({ ...filters, policy_failed: e.target.checked })}
              className="accent-status-blocked"
            />
            Policy violations only
          </label>

          <button id="apply-filters" onClick={fetchLogs} className="btn-primary text-sm px-4">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-surface/90 backdrop-blur-sm">
            <tr className="text-xs text-gray-500 font-medium uppercase tracking-wider">
              <th className="text-left px-6 py-3">Timestamp</th>
              <th className="text-left px-4 py-3">Agent ID</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Reasoning</th>
              <th className="text-right px-4 py-3">ms</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                id={`audit-row-${log.id}`}
                onClick={() => setSelected(log)}
                className="table-row"
              >
                <td className="px-6 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[120px] truncate">
                  {log.agent_id ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-200 font-medium text-sm">{log.action}</td>
                <td className="px-4 py-3"><StatusBadge status={log.action} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-[240px] truncate">
                  {log.error
                    ? <span className="text-status-blocked">{log.error}</span>
                    : log.reasoning
                    ? log.reasoning.slice(0, 70) + '...'
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs text-right font-mono">
                  {log.duration_ms ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && (
          <div className="flex items-center justify-center h-40 text-gray-500">
            No log entries match your filters.
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="p-4 border-t border-bg-border flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              id="prev-page"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-ghost text-sm disabled:opacity-30"
            >
              ← Previous
            </button>
            <button
              id="next-page"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="btn-ghost text-sm disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {selected && <AuditDrawer log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
