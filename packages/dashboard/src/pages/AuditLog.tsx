/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useApp } from '../App';
import StatusBadge from '../components/StatusBadge';
import AuditDrawer from '../components/AuditDrawer';
import { ScrollText, Download, Filter, ChevronLeft, ChevronRight, Activity } from 'lucide-react';

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
  'ALL', 'ADD_TO_CART', 'CHECKOUT_SUCCESS', 'CHECKOUT_FAILED',
  'POLICY_BLOCK', 'DISCOVER', 'CATALOG_QUERY',
  'HUMAN_REVIEW_REQUESTED', 'HUMAN_REVIEW_APPROVED',
];

const PAGE_SIZE = 50;

export default function AuditLog() {
  const { merchantId } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [filters, setFilters] = useState({
    action: 'ALL', agent_id: '', from: '', to: '', policy_failed: false,
  });

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
    const rows = logs.map((l) => headers.map((h) => JSON.stringify((l as any)[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aisle-audit-${merchantId}-${Date.now()}.csv`; a.click();
  };

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full ">
        <div className="text-center animate-fade-up">
          <div className="w-14 h-14 mx-auto mb-4 border border-foreground/10 rounded flex items-center justify-center bg-green-primary/5 ">
            <ScrollText size={22} className="text-foreground" />
          </div>
          <h2 className="text-2xl font-display text-foreground mb-2">Audit Log</h2>
          <p className="text-xs text-muted-foreground font-mono">Set your Merchant ID in the sidebar panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ScrollText size={15} className="text-foreground" />
            <h1 className="text-2xl font-display text-foreground">Audit Log</h1>
            <span className="badge badge-neutral ml-1">{total} ENTRIES</span>
          </div>
          <button id="export-csv" onClick={exportCsv} className="btn-ghost text-[10px]">
            <Download size={11} />
            EXPORT_CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={11} className="text-muted-foreground shrink-0" />
          <select
            id="filter-action"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="input-field text-[10px] w-auto"
            style={{ paddingTop: '0.3rem', paddingBottom: '0.3rem' }}
          >
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <input
            id="filter-agent-id"
            className="input-field text-[10px] font-mono w-36"
            placeholder="Agent ID..."
            style={{ paddingTop: '0.3rem', paddingBottom: '0.3rem' }}
            value={filters.agent_id}
            onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}
          />

          <input
            id="filter-from"
            type="datetime-local"
            className="input-field text-[10px] w-auto"
            style={{ paddingTop: '0.3rem', paddingBottom: '0.3rem' }}
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />

          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer font-mono">
            <input
              id="filter-policy-failed"
              type="checkbox"
              checked={filters.policy_failed}
              onChange={(e) => setFilters({ ...filters, policy_failed: e.target.checked })}
              className="accent-status-blocked"
            />
            VIOLATIONS_ONLY
          </label>

          <button id="apply-filters" onClick={fetchLogs} className="btn-primary text-[10px] px-3 py-1.5">
            APPLY
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <div className="text-center">
              <Activity size={24} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs font-mono">NO_ENTRIES_MATCH_FILTERS</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
              <tr className="text-[9px] text-muted-foreground font-medium tracking-widest">
                <th className="text-left px-5 py-2.5">TIMESTAMP</th>
                <th className="text-left px-3 py-2.5">AGENT_ID</th>
                <th className="text-left px-3 py-2.5">ACTION</th>
                <th className="text-left px-3 py-2.5">STATUS</th>
                <th className="text-left px-3 py-2.5">REASONING / ERROR</th>
                <th className="text-right px-3 py-2.5">ms</th>
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
                  <td className="px-5 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('en-US', { hour12: false })}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-blue-600/70 max-w-[100px] truncate">
                    {log.agent_id ? log.agent_id.split('_').pop()?.slice(0, 10) : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-foreground/80 tracking-wide">
                    {log.action.replace(/_/g, '_')}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={log.action} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[240px] truncate font-mono italic">
                    {log.error
                      ? <span className="text-status-blocked not-italic">{log.error}</span>
                      : log.reasoning ? `"${log.reasoning.slice(0, 65)}..."` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground/50 font-mono">
                    {log.duration_ms ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-mono">
            SHOWING {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} OF {total}
          </span>
          <div className="flex gap-2">
            <button
              id="prev-page"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-ghost disabled:opacity-30"
            >
              <ChevronLeft size={12} />
              PREV
            </button>
            <button
              id="next-page"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="btn-ghost disabled:opacity-30"
            >
              NEXT
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {selected && <AuditDrawer log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
