import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useApp } from '../App';
import StatusBadge from '../components/StatusBadge';
import AuditDrawer from '../components/AuditDrawer';
import AgentDrawer from '../components/AgentDrawer';
import {
  Zap, Pause, Play, RefreshCw, ShoppingCart, Search,
  CheckCircle2, XCircle, Clock, Activity
} from 'lucide-react';
import NetworkGraph from '../components/NetworkGraph';

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

const ACTION_ICONS: Record<string, React.ReactNode> = {
  CHECKOUT_SUCCESS:        <CheckCircle2 size={13} className="text-status-approved" />,
  HUMAN_REVIEW_APPROVED:  <CheckCircle2 size={13} className="text-status-approved" />,
  POLICY_BLOCK:            <XCircle size={13} className="text-status-blocked" />,
  CHECKOUT_FAILED:         <XCircle size={13} className="text-status-blocked" />,
  HUMAN_REVIEW_REJECTED:  <XCircle size={13} className="text-status-blocked" />,
  HUMAN_REVIEW_REQUESTED: <Clock size={13} className="text-status-pending" />,
  ADD_TO_CART:             <ShoppingCart size={13} className="text-blue-600" />,
  DISCOVER:                <Search size={13} className="text-muted-foreground" />,
};

const ACTION_LABELS: Record<string, string> = {
  ADD_TO_CART:             'ADD_TO_CART',
  CHECKOUT_SUCCESS:        'CHECKOUT_SUCCESS',
  CHECKOUT_FAILED:         'CHECKOUT_FAILED',
  POLICY_BLOCK:            'POLICY_BLOCK',
  DISCOVER:                'STORE_DISCOVER',
  CATALOG_QUERY:           'CATALOG_QUERY',
  MANIFEST_READ:           'MANIFEST_READ',
  CART_ABANDON:            'CART_ABANDON',
  HUMAN_REVIEW_REQUESTED:  'HUMAN_REVIEW_REQ',
  HUMAN_REVIEW_APPROVED:   'HUMAN_REVIEW_OK',
  HUMAN_REVIEW_REJECTED:   'HUMAN_REVIEW_FAIL',
  ORDER_STATUS:            'ORDER_STATUS',
};

function getRowAccent(action: string) {
  if (['CHECKOUT_SUCCESS', 'HUMAN_REVIEW_APPROVED'].includes(action)) return 'border-l-2 border-l-status-approved/40';
  if (['HUMAN_REVIEW_REQUESTED'].includes(action)) return 'border-l-2 border-l-status-pending/40';
  if (['POLICY_BLOCK', 'CHECKOUT_FAILED', 'HUMAN_REVIEW_REJECTED'].includes(action)) return 'border-l-2 border-l-status-blocked/40';
  return 'border-l-2 border-l-transparent';
}

function AgentChip({ id, onClick }: { id: string, onClick?: (id: string) => void }) {
  const short = id ? id.split('_').pop()?.slice(0, 8) ?? id.slice(0, 8) : '—';
  return (
    <button onClick={() => onClick && onClick(id)} className="inline-flex items-center gap-1 bg-blue-50 rounded px-1.5 py-0.5 hover:bg-blue-electric/20 transition-colors">
      <Activity size={9} className="text-blue-600 shrink-0" />
      <span className="text-[10px] text-blue-600 font-mono">{short}</span>
    </button>
  );
}

export default function LiveFeed() {
  const { merchantId, setPendingCount } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState('');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    if (!merchantId) return;
    try {
      const { data } = await axios.get(`/v1/merchants/${merchantId}/logs?limit=100`);
      const incoming: LogEntry[] = data.logs ?? [];
      const incomingIds = new Set(incoming.map((l) => l.id));
      const fresh = new Set<string>();
      for (const id of incomingIds) {
        if (!prevIdsRef.current.has(id)) fresh.add(id);
      }
      if (fresh.size > 0) {
        setNewIds(fresh);
        setTimeout(() => setNewIds(new Set()), 1500);
      }
      prevIdsRef.current = incomingIds;
      setLogs(incoming);
      const pending = incoming.filter((l) => l.action === 'HUMAN_REVIEW_REQUESTED').length;
      setPendingCount(pending);
      setLastRefresh(new Date());
      setError('');
    } catch {
      setError('Connection lost. Check API and Merchant ID.');
    }
  }, [merchantId, setPendingCount]);

  useEffect(() => {
    fetchLogs();
    if (!merchantId) return;

    // Connect to SSE stream
    const eventSource = new EventSource(`/v1/merchants/${merchantId}/stream`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          if (!isLive) return;
          const log = data.data;
          
          setLogs(prev => {
            const exists = prev.find(l => l.id === log.id);
            if (exists) return prev;
            return [log, ...prev].slice(0, 500); // Increased to 500 for massive scale feel
          });
          
          setNewIds(prev => new Set(prev).add(log.id));
          setTimeout(() => {
            setNewIds(prev => {
              const next = new Set(prev);
              next.delete(log.id);
              return next;
            });
          }, 1500);
          
          setLastRefresh(new Date());
          if (log.action === 'HUMAN_REVIEW_REQUESTED') {
             setPendingCount(p => p + 1);
          }
        }
      } catch (e) {
        console.error('Failed to parse SSE message', e);
      }
    };

    eventSource.onerror = () => {
      setError('Live stream connection lost.');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [merchantId, isLive, fetchLogs, setPendingCount]);

  const stats = [
    { label: 'EVENTS', value: logs.length, color: 'text-foreground' },
    { label: 'APPROVED', value: logs.filter(l => ['CHECKOUT_SUCCESS', 'HUMAN_REVIEW_APPROVED'].includes(l.action)).length, color: 'text-status-approved' },
    { label: 'PENDING', value: logs.filter(l => l.action === 'HUMAN_REVIEW_REQUESTED').length, color: 'text-status-pending' },
    { label: 'BLOCKED', value: logs.filter(l => ['POLICY_BLOCK', 'CHECKOUT_FAILED'].includes(l.action)).length, color: 'text-status-blocked' },
  ];

  if (!merchantId) {
    return (
      <div className="empty-state">
        <div className="empty-state-inner">
          <div className="empty-state-icon">
            <Zap size={22} className="text-foreground" />
          </div>
          <h2 className="text-lg font-display text-foreground mb-2">Awaiting Merchant ID</h2>
          <p className="text-sm text-muted-foreground">Set your Merchant ID in the sidebar to begin monitoring.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col bg-background">
        <div className="px-6 lg:px-8 py-6 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
                <span className="w-8 h-px bg-foreground/30" />
                Live Monitor
              </span>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-display text-foreground">Live Feed</h1>
                {isLive && (
                  <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 live-dot" />
                    Live
                  </span>
                )}
                <span className="badge badge-neutral text-[9px]">{logs.length < 500 ? logs.length : 500} events</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground font-mono text-xs">{lastRefresh.toLocaleTimeString()}</span>
              <button id="toggle-live" onClick={() => setIsLive(!isLive)} className="btn-ghost">
                {isLive ? <Pause size={11} /> : <Play size={11} />}
                {isLive ? 'Pause' : 'Resume'}
              </button>
              <button id="refresh-logs" onClick={fetchLogs} className="btn-ghost">
                <RefreshCw size={11} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-5">
          {stats.map((s) => (
            <div key={s.label} className="card py-3 px-4">
              <div>
                <div className={`text-lg font-bold font-mono leading-none ${s.color}`}>{s.value}</div>
                <div className="text-[9px] text-muted-foreground tracking-widest mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Network Graph */}
      <NetworkGraph logs={logs} merchantId={merchantId} onAgentClick={setSelectedAgent} />

      {/* Main Content */}
      {error && (
        <div className="mx-6 mt-3 p-2.5 bg-status-blocked/8 border border-status-blocked/20 rounded text-status-blocked text-xs font-mono flex items-center gap-2">
          <XCircle size={12} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <Activity size={28} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-xs font-mono text-muted-foreground">NO_AGENT_ACTIVITY_DETECTED</p>
              <code className="text-[10px] text-muted-foreground/50 mt-1.5 block">$ node demo/agent_travel.js</code>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border">
              <tr className="text-[9px] text-muted-foreground font-medium tracking-widest">
                <th className="text-left px-5 py-2.5">TIME</th>
                <th className="text-left px-3 py-2.5">AGENT</th>
                <th className="text-left px-3 py-2.5">ACTION</th>
                <th className="text-right px-3 py-2.5">AMOUNT</th>
                <th className="text-left px-3 py-2.5">STATUS</th>
                <th className="text-left px-3 py-2.5">REASONING</th>
                <th className="text-right px-3 py-2.5">ms</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isNew = newIds.has(log.id);
                const out = log.output as Record<string, unknown> | null;
                const amount = out?.amount_inr ?? out?.subtotal_inr;
                const icon = ACTION_ICONS[log.action] ?? <Activity size={13} className="text-muted-foreground" />;
                return (
                  <tr
                    key={log.id}
                    id={`log-row-${log.id}`}
                    onClick={() => setSelected(log)}
                    className={`table-row ${getRowAccent(log.action)} ${isNew ? 'event-new' : ''}`}
                  >
                    <td className="px-5 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                    </td>
                    <td className="px-3 py-2.5">
                      <AgentChip id={log.agent_id} onClick={setSelectedAgent} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {icon}
                        <span className="font-mono text-foreground/80 tracking-wide">
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground font-medium">
                      {amount ? `₹${Number(amount).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={log.action} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate font-mono italic">
                      {log.reasoning ? `"${log.reasoning.slice(0, 55)}..."` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground/50 font-mono">
                      {log.duration_ms ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </div>

      {/* Drawers */}
      {selected && <AuditDrawer log={selected} onClose={() => setSelected(null)} />}
      <AgentDrawer agentId={selectedAgent} onClose={() => setSelectedAgent(null)} />
    </>
  );
}
