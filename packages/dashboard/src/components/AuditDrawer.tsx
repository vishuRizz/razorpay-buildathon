/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { X, Brain, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Clock } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface LogEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  action: string;
  input: any;
  output: any;
  reasoning: string;
  policy_result: any;
  duration_ms: number;
  error: string;
}

interface AuditDrawerProps {
  log: LogEntry;
  onClose: () => void;
}

function DataBlock({ label, data, icon }: { label: string; data: any; icon: React.ReactNode }) {
  if (!data) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-[9px] text-gray-mid font-medium tracking-widest uppercase mb-2">
        {icon}
        {label}
      </div>
      <pre className="bg-bg-elevated rounded border border-bg-border p-3 text-xs text-gray-cold font-mono overflow-x-auto max-h-48 leading-relaxed">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditDrawer({ log, onClose }: AuditDrawerProps) {
  const amount = (log.output as any)?.amount_inr ?? (log.output as any)?.subtotal_inr;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        id="audit-drawer"
        className="fixed right-0 top-0 h-full w-[480px] bg-bg-surface border-l border-bg-border z-50 animate-slide-in overflow-y-auto neural-bg"
      >
        {/* Green accent line at top */}
        <div className="h-px bg-gradient-to-r from-transparent via-green-primary to-transparent" />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-gray-mid tracking-widest mb-1">AUDIT_EVENT</div>
              <h2 className="text-sm font-bold text-white tracking-wide">{log.action.replace(/_/g, ' ')}</h2>
              <p className="text-[10px] text-gray-mid font-mono mt-1 truncate">{log.id}</p>
            </div>
            <button
              id="close-drawer"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded border border-bg-border text-gray-mid hover:text-white hover:border-green-primary/30 transition-colors ml-3 shrink-0"
            >
              <X size={13} />
            </button>
          </div>

          {/* Status + meta strip */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            {[
              { label: 'STATUS',    value: <StatusBadge status={log.action} /> },
              { label: 'DURATION',  value: log.duration_ms ? `${log.duration_ms}ms` : '—' },
              { label: 'AGENT_ID',  value: log.agent_id ?? '—' },
              { label: 'TIMESTAMP', value: new Date(log.timestamp).toLocaleTimeString() },
            ].map((m, i) => (
              <div key={i} className="bg-bg-elevated rounded border border-bg-border p-2.5">
                <div className="text-[9px] text-gray-mid tracking-widest mb-1">{m.label}</div>
                <div className="text-xs text-gray-cold font-mono truncate">
                  {typeof m.value === 'string' ? m.value : m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Amount highlight */}
          {amount && (
            <div className="mb-4 rounded border border-green-primary/20 bg-green-primary/5 p-3 flex items-center justify-between">
              <span className="text-[9px] text-gray-mid tracking-widest">TRANSACTION_AMOUNT</span>
              <span className="text-lg font-bold text-green-primary font-mono">₹{Number(amount).toLocaleString()}</span>
            </div>
          )}

          {/* AI Reasoning Trace */}
          {log.reasoning && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 text-[9px] text-green-primary font-medium tracking-widest uppercase mb-2">
                <Brain size={10} />
                AI_REASONING_TRACE
              </div>
              <div className="bg-green-primary/5 border border-green-primary/15 rounded p-3 text-xs text-gray-cold leading-relaxed font-mono italic">
                &ldquo;{log.reasoning}&rdquo;
              </div>
            </div>
          )}

          {/* Error */}
          {log.error && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 text-[9px] text-status-blocked font-medium tracking-widest uppercase mb-2">
                <AlertTriangle size={10} />
                ERROR_DETAIL
              </div>
              <div className="bg-status-blocked/5 border border-status-blocked/15 rounded p-3 text-xs text-status-blocked font-mono">
                {log.error}
              </div>
            </div>
          )}

          <DataBlock
            label="POLICY_RESULT"
            data={log.policy_result}
            icon={<ShieldCheck size={10} />}
          />
          <DataBlock
            label="INPUT"
            data={log.input}
            icon={<ArrowDownToLine size={10} />}
          />
          <DataBlock
            label="OUTPUT"
            data={log.output}
            icon={<ArrowUpFromLine size={10} />}
          />
        </div>
      </div>
    </>
  );
}
