import React, { useState } from 'react';
import { X, Brain, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Clock, CheckCircle2, ShieldOff } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { apiUrl } from '../lib/api';

interface LogEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  merchant_id?: string;
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
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-medium tracking-widest uppercase mb-2">
        {icon}
        {label}
      </div>
      <pre className="bg-muted rounded border border-border p-3 text-xs text-foreground/80 font-mono overflow-x-auto max-h-48 leading-relaxed">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditDrawer({ log, onClose }: AuditDrawerProps) {
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'approved' | 'rejected' | 'loading'>('pending');
  const amount = (log.output as any)?.amount_inr ?? (log.output as any)?.subtotal_inr;

  const handleReview = async (action: 'approve' | 'reject') => {
    try {
      setReviewStatus('loading');
      const orderId = (log.output as any)?.order_id;
      const merchantId = log.merchant_id;
      if (!orderId || !merchantId) return;

      const res = await fetch(apiUrl(`/v1/merchants/${merchantId}/orders/${orderId}/${action}`), {
        method: 'POST',
      });
      if (res.ok) {
        setReviewStatus(action === 'approve' ? 'approved' : 'rejected');
      } else {
        setReviewStatus('pending');
      }
    } catch (e) {
      setReviewStatus('pending');
    }
  };

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
        className="fixed right-0 top-0 h-full w-[480px] bg-card border-l border-border z-50 animate-slide-in overflow-y-auto"
      >
        {/* Green accent line at top */}
        <div className="h-px bg-gradient-to-r from-transparent via-green-primary to-transparent" />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-muted-foreground tracking-widest mb-1">AUDIT_EVENT</div>
              <h2 className="text-sm font-bold text-foreground tracking-wide">{log.action.replace(/_/g, ' ')}</h2>
              <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate">{log.id}</p>
            </div>
            <button
              id="close-drawer"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/15 transition-colors ml-3 shrink-0"
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
              <div key={i} className="bg-muted rounded border border-border p-2.5">
                <div className="text-[9px] text-muted-foreground tracking-widest mb-1">{m.label}</div>
                <div className="text-xs text-foreground/80 font-mono truncate">
                  {typeof m.value === 'string' ? m.value : m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Amount highlight */}
          {amount && (
            <div className="mb-4 rounded border border-foreground/10 bg-green-primary/5 p-3 flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground tracking-widest">TRANSACTION_AMOUNT</span>
              <span className="text-lg font-bold text-foreground font-mono">₹{Number(amount).toLocaleString()}</span>
            </div>
          )}

          {/* AI Reasoning Trace */}
          {log.reasoning && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 text-[9px] text-foreground font-medium tracking-widest uppercase mb-2">
                <Brain size={10} />
                AI_REASONING_TRACE
              </div>
              <div className="bg-green-primary/5 border border-foreground/10 rounded p-3 text-xs text-foreground/80 leading-relaxed font-mono italic">
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

          {/* Action Buttons for Human Review */}
          {log.action === 'HUMAN_REVIEW_REQUESTED' && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="text-[10px] text-foreground/80 font-medium tracking-widest uppercase mb-4 text-center">
                Manual Override Required
              </div>
              <div className="flex gap-3">
                <button
                  disabled={reviewStatus !== 'pending'}
                  onClick={() => handleReview('reject')}
                  className={`flex-1 py-3 px-4 rounded font-mono text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 border transition-all ${
                    reviewStatus === 'rejected' 
                      ? 'bg-status-blocked/10 border-status-blocked text-status-blocked'
                      : 'border-status-blocked/30 text-status-blocked hover:bg-status-blocked/5'
                  } disabled:opacity-50`}
                >
                  {reviewStatus === 'rejected' ? <ShieldOff size={14} /> : <X size={14} />}
                  {reviewStatus === 'rejected' ? 'REJECTED' : 'REJECT'}
                </button>
                <button
                  disabled={reviewStatus !== 'pending'}
                  onClick={() => handleReview('approve')}
                  className={`flex-1 py-3 px-4 rounded font-mono text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 border transition-all shadow-[0_0_15px_rgba(118,185,0,0.15)] ${
                    reviewStatus === 'approved'
                      ? 'bg-green-primary text-black border-green-primary'
                      : 'bg-foreground/5 border-foreground/15 text-foreground hover:bg-green-primary hover:text-black'
                  } disabled:opacity-50`}
                >
                  {reviewStatus === 'approved' ? <CheckCircle2 size={14} /> : <ShieldCheck size={14} />}
                  {reviewStatus === 'approved' ? 'APPROVED' : 'APPROVE'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
