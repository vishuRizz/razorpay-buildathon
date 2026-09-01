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
      className="flex items-start gap-2.5 py-2 border-b border-border last:border-0 animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="mt-0.5 shrink-0">
        <Icon size={12} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-foreground/80 font-mono tracking-wide">{step.step}</span>
          <span className={`text-[9px] font-mono ${color}`}>{step.ms}ms</span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{step.detail}</div>
      </div>
    </div>
  );
}

export default function SimulatePanel() {
  const [running, setRunning] = useState<Scenario | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState('');

  // Interactive rendering state
  const [renderedSteps, setRenderedSteps] = useState<Step[]>([]);
  const [renderedReasoning, setRenderedReasoning] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  React.useEffect(() => {
    if (!result) {
      setRenderedSteps([]);
      setRenderedReasoning('');
      setShowSummary(false);
      return;
    }

    let isMounted = true;
    const executeSim = async () => {
      // 1. Render steps one by one with simulated delay based on their execution time
      for (let i = 0; i < result.steps.length; i++) {
        await new Promise(r => setTimeout(r, Math.max(400, Math.min(1200, result.steps[i].ms))));
        if (!isMounted) return;
        setRenderedSteps(prev => [...prev, result.steps[i]]);
      }

      // 2. Stream reasoning if exists
      if (result.reasoning) {
        await new Promise(r => setTimeout(r, 600));
        const words = result.reasoning.split(' ');
        for (let i = 0; i < words.length; i++) {
          await new Promise(r => setTimeout(r, 40)); // word by word typing
          if (!isMounted) return;
          setRenderedReasoning(prev => prev + (i === 0 ? '' : ' ') + words[i]);
        }
      }

      // 3. Show final outcome
      await new Promise(r => setTimeout(r, 500));
      if (isMounted) setShowSummary(true);
    };

    executeSim();
    return () => { isMounted = false; };
  }, [result]);

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
    <div className="p-6 max-w-3xl animate-fade-up bg-background min-h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Play size={15} className="text-foreground" />
        <h1 className="text-2xl font-display text-foreground">Demo Runner</h1>
      </div>
      <p className="text-[10px] text-muted-foreground font-mono mb-6">
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
                      <span className="text-[10px] font-bold text-foreground tracking-widest font-mono">{s.label}</span>
                      <span className="badge badge-neutral text-[9px]">{s.agentName}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">budget: {s.budget}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isRunning ? (
                        <Loader2 size={14} className="text-foreground animate-spin" />
                      ) : (
                        <ChevronRight size={14} className="text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">{s.desc}</p>
                  <div className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground/60 font-mono">
                    Expected: <span className="text-muted-foreground">{s.expectedOutcome}</span>
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

      {/* Result (Terminal/Chat style) */}
      {result && outcomeConfig && (
        <div className={`card border ${showSummary ? outcomeConfig.border : 'border-border'} ${showSummary ? outcomeConfig.bg : 'bg-muted'} animate-fade-up`}>
          
          {/* Header */}
          <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
            <Zap size={14} className="text-blue-600 animate-pulse" />
            <span className="text-[10px] font-bold text-foreground tracking-widest font-mono">
              AGENT_TERMINAL
            </span>
            <span className="badge badge-neutral text-[9px] ml-2">v2.0</span>
          </div>

          {/* Steps */}
          <div className="mb-4 space-y-1">
            {renderedSteps.map((step, i) => (
              <StepRow key={i} step={step} index={i} />
            ))}
            {renderedSteps.length < result.steps.length && (
              <div className="flex items-center gap-2 py-2 animate-pulse">
                <Loader2 size={12} className="text-muted-foreground animate-spin shrink-0" />
                <span className="text-[10px] text-muted-foreground font-mono">Agent is thinking...</span>
              </div>
            )}
          </div>

          {/* AI Reasoning (Streaming) */}
          {result.reasoning && renderedSteps.length === result.steps.length && (
            <div className="mb-4 rounded border border-foreground/10 bg-green-primary/5 p-3">
              <div className="flex items-center gap-1 text-[9px] text-foreground tracking-widest mb-1.5 font-mono">
                <Zap size={10} />
                AI_REASONING
              </div>
              <p className="text-[10px] text-foreground/80 font-mono italic leading-relaxed">
                &ldquo;{renderedReasoning}
                {renderedReasoning.length < result.reasoning.length && <span className="animate-pulse">_</span>}
                &rdquo;
              </p>
            </div>
          )}

          {/* Final Summary Reveal */}
          {showSummary && (
            <div className="animate-fade-up">
              <div className="flex items-center gap-2 mb-3 mt-4 border-t border-border pt-4">
                {outcomeConfig.icon}
                <span className={`text-xs font-bold tracking-widest font-mono ${outcomeConfig.color}`}>
                  {outcomeConfig.label}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono ml-auto">{result.duration_ms}ms total</span>
              </div>

              <p className="text-[10px] text-foreground/80 font-mono mb-4">{result.summary}</p>

              {result.outcome === 'SUCCESS' && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'PRODUCT', value: result.product ?? '—' },
                    { label: 'AMOUNT', value: `₹${result.amount_inr?.toLocaleString()}` },
                    { label: 'ORDER_ID', value: result.order_id?.slice(-10) ?? '—' },
                  ].map((f) => (
                    <div key={f.label} className="bg-background rounded border border-border p-2">
                      <div className="text-[9px] text-muted-foreground tracking-widest mb-0.5">{f.label}</div>
                      <div className="text-[10px] text-foreground/80 font-mono truncate">{f.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Links */}
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <a href="/live" className="text-foreground hover:underline flex items-center gap-1 bg-foreground/5 px-2 py-1 rounded">
                  <TrendingUp size={10} />
                  View in Live Feed
                </a>
                {result.audit_log_id && (
                  <span className="text-muted-foreground ml-auto">Audit: {result.audit_log_id}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
