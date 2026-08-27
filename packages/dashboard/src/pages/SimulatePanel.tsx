import React, { useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2, XCircle, Clock, Play, Zap, ShieldCheck,
  TrendingUp, ChevronRight, Loader2, AlertTriangle
} from 'lucide-react';

type Scenario = 'happy_path' | 'budget_fail' | 'human_review';
type Outcome = 'SUCCESS' | 'BLOCKED' | 'PENDING_REVIEW' | null;

interface Step {
  step: string;
  status: 'ok' | 'blocked' | 'review' | 'error';
  detail: string;
  ms: number;
}

interface SimResult {
  scenario: Scenario;
  outcome: Outcome;
  summary: string;
  steps: Step[];
  amount_inr?: number;
  product?: string;
  reasoning?: string;
  order_id?: string;
  razorpay_order_id?: string;
  audit_log_id?: string;
  duration_ms: number;
}

const SCENARIOS: Array<{
  id: Scenario;
  label: string;
  desc: string;
  agentName: string;
  budget: string;
  expectedOutcome: string;
  color: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'happy_path',
    label: 'HAPPY_PATH',
    desc: 'Agent discovers store, picks best product, clears policy, creates Razorpay order',
    agentName: 'TravelBot-Pro',
    budget: '₹5,000',
    expectedOutcome: 'CHECKOUT_SUCCESS',
    color: 'border-status-approved/30 hover:border-status-approved/60 bg-status-approved/5',
    icon: <CheckCircle2 size={16} className="text-status-approved" />,
  },
  {
    id: 'budget_fail',
    label: 'BUDGET_VIOLATION',
    desc: 'Rogue agent tries to purchase beyond its session budget — Policy Engine intercepts',
    agentName: 'UnrestrictedShopBot',
    budget: '₹500',
    expectedOutcome: 'POLICY_BLOCK',
    color: 'border-status-blocked/30 hover:border-status-blocked/60 bg-status-blocked/5',
    icon: <XCircle size={16} className="text-status-blocked" />,
  },
  {
    id: 'human_review',
    label: 'HUMAN_REVIEW',
    desc: 'High-value purchase exceeds merchant threshold — paused for human approval',
    agentName: 'EnterpriseAgent-v2',
    budget: '₹80,000',
    expectedOutcome: 'PENDING_REVIEW',
    color: 'border-status-pending/30 hover:border-status-pending/60 bg-status-pending/5',
    icon: <Clock size={16} className="text-status-pending" />,
  },
];

function StepRow({ step, index }: { step: Step; index: number }) {
  const color = step.status === 'ok' ? 'text-status-approved' :
                step.status === 'blocked' ? 'text-status-blocked' :
                step.status === 'review' ? 'text-status-pending' : 'text-status-blocked';
  const Icon = step.status === 'ok' ? CheckCircle2 :
               step.status === 'blocked' ? XCircle :
               step.status === 'review' ? Clock : AlertTriangle;

  return (
    <div
      className="flex items-start gap-2.5 py-2 border-b border-bg-border last:border-0 animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="mt-0.5 shrink-0">
        <Icon size={12} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-cold font-mono tracking-wide">{step.step}</span>
          <span className={`text-[9px] font-mono ${color}`}>{step.ms}ms</span>
        </div>
        <div className="text-[10px] text-gray-mid font-mono truncate mt-0.5">{step.detail}</div>
      </div>
    </div>
  );
}

export default function SimulatePanel() {
  const [running, setRunning] = useState<Scenario | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState('');

  const run = async (scenario: Scenario) => {
    setRunning(scenario);
    setResult(null);
    setError('');
    try {
      const { data } = await axios.post('/v1/simulate', { scenario });
      setResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Simulation failed';
      setError(msg);
    } finally {
      setRunning(null);
    }
  };

  const outcomeConfig = result ? {
    SUCCESS:        { label: 'PURCHASE COMPLETE',     color: 'text-status-approved', border: 'border-status-approved/20', bg: 'bg-status-approved/5', icon: <CheckCircle2 size={16} className="text-status-approved" /> },
    BLOCKED:        { label: 'BLOCKED BY POLICY',     color: 'text-status-blocked',  border: 'border-status-blocked/20',  bg: 'bg-status-blocked/5',  icon: <XCircle size={16} className="text-status-blocked" /> },
    PENDING_REVIEW: { label: 'AWAITING HUMAN REVIEW', color: 'text-status-pending',  border: 'border-status-pending/20',  bg: 'bg-status-pending/5',  icon: <Clock size={16} className="text-status-pending" /> },
  }[result.outcome ?? 'SUCCESS'] : null;

  return (
    <div className="p-6 max-w-3xl animate-fade-up bg-bg-base neural-bg min-h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Play size={15} className="text-green-primary" />
        <h1 className="text-sm font-bold text-white tracking-widest">DEMO_RUNNER</h1>
      </div>
      <p className="text-[10px] text-gray-mid font-mono mb-6">
        Trigger a complete AI agent purchase flow end-to-end. Watch events appear live in the Live Feed.
      </p>

      {/* Scenario cards */}
      <div className="space-y-3 mb-6">
        {SCENARIOS.map((s) => {
          const isRunning = running === s.id;
          return (
            <div
              key={s.id}
              className={`card border transition-all duration-200 cursor-pointer ${s.color} ${isRunning ? 'opacity-70' : ''}`}
              onClick={() => !running && run(s.id)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-white tracking-widest font-mono">{s.label}</span>
                      <span className="badge badge-neutral text-[9px]">{s.agentName}</span>
                      <span className="text-[9px] text-gray-mid font-mono">budget: {s.budget}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isRunning ? (
                        <Loader2 size={14} className="text-green-primary animate-spin" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-mid" />
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-mid font-mono">{s.desc}</p>
                  <div className="mt-1.5 flex items-center gap-1 text-[9px] text-gray-mid/60 font-mono">
                    Expected: <span className="text-gray-mid">{s.expectedOutcome}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded border border-status-blocked/20 bg-status-blocked/5 p-3 flex items-center gap-2 text-xs text-status-blocked font-mono">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Result */}
      {result && outcomeConfig && (
        <div className={`card border ${outcomeConfig.border} ${outcomeConfig.bg} animate-fade-up`}>
          {/* Outcome header */}
          <div className="flex items-center gap-2 mb-3">
            {outcomeConfig.icon}
            <span className={`text-xs font-bold tracking-widest font-mono ${outcomeConfig.color}`}>
              {outcomeConfig.label}
            </span>
            <span className="text-[9px] text-gray-mid font-mono ml-auto">{result.duration_ms}ms total</span>
          </div>

          {/* Summary */}
          <p className="text-[10px] text-gray-cold font-mono mb-3">{result.summary}</p>

          {/* Transaction details */}
          {result.outcome === 'SUCCESS' && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: 'PRODUCT', value: result.product ?? '—' },
                { label: 'AMOUNT', value: `₹${result.amount_inr?.toLocaleString()}` },
                { label: 'ORDER_ID', value: result.order_id?.slice(-10) ?? '—' },
              ].map((f) => (
                <div key={f.label} className="bg-bg-elevated rounded border border-bg-border p-2">
                  <div className="text-[9px] text-gray-mid tracking-widest mb-0.5">{f.label}</div>
                  <div className="text-[10px] text-gray-cold font-mono truncate">{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* AI Reasoning */}
          {result.reasoning && (
            <div className="mb-3 rounded border border-green-primary/15 bg-green-primary/5 p-2.5">
              <div className="flex items-center gap-1 text-[9px] text-green-primary tracking-widest mb-1 font-mono">
                <Zap size={9} />
                AI_REASONING
              </div>
              <p className="text-[10px] text-gray-cold font-mono italic leading-relaxed">
                &ldquo;{result.reasoning.slice(0, 200)}{result.reasoning.length > 200 ? '...' : ''}&rdquo;
              </p>
            </div>
          )}

          {/* Steps */}
          <div>
            <div className="text-[9px] text-gray-mid tracking-widest mb-1 font-mono">EXECUTION_TRACE</div>
            <div className="bg-bg-elevated rounded border border-bg-border px-3">
              {result.steps.map((step, i) => (
                <StepRow key={i} step={step} index={i} />
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="mt-3 flex items-center gap-3 text-[10px] font-mono">
            <a href="/live" className="text-green-primary hover:underline flex items-center gap-1">
              <TrendingUp size={10} />
              View in Live Feed
            </a>
            {result.audit_log_id && (
              <span className="text-gray-mid">Audit: {result.audit_log_id}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
