import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { API_BASE } from '../lib/api';
import {
  Brain, Radio, Search, Store, ShieldCheck, CreditCard, CheckCircle2,
  XCircle, Loader2, Zap, Clock, Play, Sparkles, ExternalLink, Square,
  ArrowRight, Activity, Copy, Banknote
} from 'lucide-react';

interface AgentEvent {
  id: string;
  timestamp: string;
  type: string;
  step?: number;
  label?: string;
  detail?: string;
  status?: 'pending' | 'active' | 'ok' | 'error';
  meta?: Record<string, unknown>;
}

interface AgentSession {
  session_id: string;
  agent_id?: string;
  task?: string;
  model?: string;
  status: 'running' | 'complete' | 'error' | 'stopped';
  started_at: string;
  updated_at: string;
  events: AgentEvent[];
}

const DEFAULT_TASK =
  'Buy something useful under ₹2,000 from any AISLE store. Pick one product quickly and checkout.';

const PRESETS = [
  { label: 'Surprise me', task: DEFAULT_TASK },
  { label: 'Book + snack', task: 'Buy a paperback under ₹500 from BookNook.' },
  { label: 'Pet care', task: 'Buy something for my dog under ₹1,500 from PetPals.' },
  { label: 'Skincare', task: 'Buy a vitamin C serum under ₹1,000 from BeautyBar.' },
  { label: 'Kids gift', task: 'Find a fun gift for an 8-year-old under ₹1,500 from KidZone.' },
  { label: 'Fitness', task: 'Buy home workout gear under ₹1,500 from FitZone.' },
];

const PIPELINE = [
  { id: 'task', label: 'Task', icon: Zap },
  { id: 'discover', label: 'Discover', icon: Store },
  { id: 'compare', label: 'Search', icon: Search },
  { id: 'policy', label: 'Policy', icon: ShieldCheck },
  { id: 'checkout', label: 'Checkout', icon: CreditCard },
] as const;

function eventIcon(type: string, meta?: Record<string, unknown>) {
  const tool = meta?.tool as string | undefined;
  if (type === 'session_start' || type === 'stop_requested' || type === 'stopped') {
    return type === 'stopped' ? (
      <Square size={14} className="text-status-blocked" />
    ) : (
      <Zap size={14} className="text-foreground" />
    );
  }
  if (type === 'done') return <CheckCircle2 size={14} className="text-green-600" />;
  if (type === 'error') return <XCircle size={14} className="text-status-blocked" />;
  if (type === 'thinking') return <Loader2 size={14} className="text-blue-600 animate-spin" />;
  if (tool === 'discover_stores') return <Store size={14} className="text-blue-600" />;
  if (tool === 'search_catalog') return <Search size={14} className="text-blue-600" />;
  if (tool === 'create_cart') return <ShieldCheck size={14} className="text-status-pending" />;
  if (tool === 'checkout') return <CreditCard size={14} className="text-foreground" />;
  if (tool === 'check_order_status') return <CheckCircle2 size={14} className="text-green-600" />;
  return <Brain size={14} className="text-muted-foreground" />;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function collapseEvents(events: AgentEvent[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  const skip = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (skip.has(ev.id)) continue;

    if (ev.type === 'thinking') {
      if (i === events.length - 1) out.push(ev);
      continue;
    }

    if (ev.type === 'tool_call') {
      const next = events.slice(i + 1).find((e) => e.type === 'tool_result' && e.step === ev.step);
      if (next && (next.meta?.tool as string) === (ev.meta?.tool as string)) {
        out.push({ ...next, label: next.label ?? ev.label });
        skip.add(next.id);
        continue;
      }
    }
    if (ev.type === 'tool_result') continue;
    out.push(ev);
  }
  return out;
}

function pipelineState(events: AgentEvent[]) {
  const has = (tool: string) =>
    events.some((e) => e.type === 'tool_result' && e.meta?.tool === tool && e.status === 'ok');

  return {
    task: events.some((e) => e.type === 'session_start'),
    discover: has('discover_stores'),
    compare: events.filter((e) => e.type === 'tool_result' && e.meta?.tool === 'search_catalog' && e.status === 'ok').length >= 1,
    policy: has('create_cart'),
    checkout: has('checkout'),
  };
}

function statusMeta(status?: AgentSession['status']) {
  switch (status) {
    case 'running':
      return { text: 'Running', className: 'badge-approved', pulse: true };
    case 'complete':
      return { text: 'Complete', className: 'badge-approved', pulse: false };
    case 'stopped':
      return { text: 'Stopped', className: 'badge-pending', pulse: false };
    case 'error':
      return { text: 'Failed', className: 'badge-blocked', pulse: false };
    default:
      return { text: 'Idle', className: 'badge-neutral', pulse: false };
  }
}

export default function AgentBrain() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [task, setTask] = useState(DEFAULT_TASK);
  const [marketplace, setMarketplace] = useState<{
    store_count: number;
    product_count: number;
    category_count: number;
    price_range_inr?: { min: number; max: number };
    stores?: { name: string; product_count: number }[];
  } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [groqOk, setGroqOk] = useState(true);
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleMsg, setSettleMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const fetchSession = useCallback(async () => {
    try {
      const [{ data: latest }, { data: status }] = await Promise.all([
        axios.get<{ session: AgentSession | null }>('/v1/brain/events/latest'),
        axios.get<{
          running: boolean;
          llm_configured?: boolean;
          llm_provider?: string | null;
          anthropic_configured?: boolean;
          groq_configured: boolean;
        }>('/v1/brain/run/status'),
      ]);
      setSession((prev) => {
        if (!latest.session && prev?.status === 'running') return prev;
        return latest.session;
      });
      const ok = status.llm_configured ?? status.groq_configured ?? status.anthropic_configured;
      setGroqOk(Boolean(ok));
      setLlmProvider(status.llm_provider ?? null);
      setError('');
    } catch (err: unknown) {
      const target = API_BASE || '(same origin / Vite proxy)';
      const detail = axios.isAxiosError(err)
        ? [err.message, err.code, err.response?.status].filter(Boolean).join(' · ')
        : err instanceof Error
          ? err.message
          : 'unknown error';
      setError(`Cannot reach API at ${target}. ${detail}`);
    }
  }, []);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 1200);
    return () => clearInterval(interval);
  }, [fetchSession]);

  useEffect(() => {
    axios
      .get<{
        store_count: number;
        product_count: number;
        category_count: number;
        price_range_inr?: { min: number; max: number };
        stores?: { name: string; product_count: number }[];
      }>('/v1/stores/stats')
      .then(({ data }) => setMarketplace(data))
      .catch(() => setMarketplace(null));
  }, []);

  useEffect(() => {
    if ((session?.events.length ?? 0) > prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCount.current = session?.events.length ?? 0;
  }, [session?.events.length]);

  const launchAgent = async () => {
    setLaunching(true);
    setLaunchError('');
    try {
      await axios.post('/v1/brain/run', { task });
      await fetchSession();
    } catch (err: unknown) {
      setLaunchError(
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to launch agent'
      );
    } finally {
      setLaunching(false);
    }
  };

  const stopAgent = async () => {
    setStopping(true);
    setLaunchError('');
    try {
      await axios.post('/v1/brain/stop', { session_id: session?.session_id });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'stopped',
              events: [
                ...prev.events,
                {
                  id: `evt_local_stop_${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  type: 'stopped',
                  label: 'Agent stopped',
                  detail: 'Stopped from dashboard. You can launch a new agent now.',
                  status: 'error',
                },
              ],
            }
          : prev
      );
      await fetchSession();
    } catch (err: unknown) {
      setLaunchError(
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to stop agent'
      );
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setSession((prev) => (prev ? { ...prev, status: 'stopped' } : prev));
      }
    } finally {
      setStopping(false);
    }
  };

  const isRunning = session?.status === 'running' || launching;
  const timeline = collapseEvents(session?.events ?? []);
  const pipe = useMemo(() => pipelineState(session?.events ?? []), [session?.events]);
  const st = statusMeta(session?.status);
  const toolCalls = session?.events.filter((e) => e.type === 'tool_result').length ?? 0;
  const catalogSearches =
    session?.events.filter((e) => e.type === 'tool_result' && e.meta?.tool === 'search_catalog').length ?? 0;
  const doneStages = PIPELINE.filter((s) => pipe[s.id as keyof typeof pipe]).length;
  const progressPct = Math.round((doneStages / PIPELINE.length) * 100);

  const razorpayCheckout = useMemo(() => {
    const ev = [...(session?.events ?? [])]
      .reverse()
      .find(
        (e) =>
          e.type === 'tool_result' &&
          e.meta?.tool === 'checkout' &&
          e.status === 'ok'
      );
    if (!ev) return null;
    const result = (ev.meta?.result ?? {}) as Record<string, unknown>;
    return {
      order_id: String(result.order_id ?? ''),
      razorpay_order_id: String(result.razorpay_order_id ?? ''),
      amount_inr: result.amount_inr as number | undefined,
      status: String(result.status ?? 'CREATED'),
    };
  }, [session?.events]);

  const settlePayment = async () => {
    if (!razorpayCheckout?.razorpay_order_id) return;
    setSettling(true);
    setSettleMsg('');
    try {
      const { data } = await axios.post('/v1/demo/razorpay/settle', {
        razorpay_order_id: razorpayCheckout.razorpay_order_id,
      });
      setSettleMsg(data.message ?? 'Payment settled');
    } catch (err: unknown) {
      setSettleMsg(
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Settle failed'
      );
    } finally {
      setSettling(false);
    }
  };

  const copyRzpId = async () => {
    if (!razorpayCheckout?.razorpay_order_id) return;
    try {
      await navigator.clipboard.writeText(razorpayCheckout.razorpay_order_id);
      setSettleMsg('Razorpay order id copied');
    } catch {
      setSettleMsg(razorpayCheckout.razorpay_order_id);
    }
  };

  return (
    <div className="min-h-full relative overflow-hidden">
      {/* Atmospheric wash - keeps brand surface, not flat white */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 10% -10%, color-mix(in oklch, var(--status-info) 8%, transparent), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 0%, color-mix(in oklch, var(--status-approved) 6%, transparent), transparent 50%)',
        }}
      />

      <div className="relative p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <PageHeader
          eyebrow="Autonomous Buyer"
          title="Agent Brain"
          subtitle="Launch a shopping agent. Watch discover → search → policy → checkout stream live."
          icon={
            <div className="p-2.5 rounded-2xl bg-foreground/[0.04] border border-foreground/10 shadow-sm">
              <Brain size={22} className="text-foreground" />
            </div>
          }
          badge={
            <span className={`badge ${st.className}`}>
              {st.pulse && <Radio size={10} className="live-dot" />}
              {st.text}
            </span>
          }
          actions={
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Session</div>
              <div className="font-mono text-xs text-foreground/80">
                {session?.session_id?.slice(0, 18) ?? '-'}
              </div>
              {session?.model && (
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                  {session.model}
                </div>
              )}
            </div>
          }
        />

        {/* Pipeline progress */}
        <div className="card !py-4 !px-5 animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
              Purchase pipeline
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">{progressPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {PIPELINE.map((stage, i) => {
              const done = pipe[stage.id as keyof typeof pipe];
              const active =
                isRunning && !done && (i === 0 || pipe[PIPELINE[i - 1].id as keyof typeof pipe]);
              const Icon = stage.icon;
              return (
                <React.Fragment key={stage.id}>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-500 shrink-0 ${
                      done
                        ? 'bg-foreground text-background border-foreground shadow-sm'
                        : active
                          ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-[0_0_0_3px_rgba(37,99,235,0.08)]'
                          : 'bg-muted/60 border-border text-muted-foreground'
                    }`}
                  >
                    {done ? <CheckCircle2 size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                    <span className="text-[11px] font-medium tracking-wide">{stage.label}</span>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight
                      size={12}
                      className={`shrink-0 mx-0.5 transition-colors duration-500 ${
                        done ? 'text-foreground/40' : 'text-muted-foreground/25'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* Control column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card relative overflow-hidden !p-0">
              <div
                className="absolute inset-x-0 top-0 h-24 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(180deg, color-mix(in oklch, var(--status-approved) 7%, transparent), transparent)',
                }}
              />
              <div className="relative p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-foreground" />
                    <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-foreground">
                      Mission
                    </span>
                  </div>
                  {marketplace && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {marketplace.store_count} stores · {marketplace.product_count} SKUs
                    </span>
                  )}
                </div>

                <textarea
                  className="input-field w-full text-sm !font-[inherit] min-h-[100px] resize-none leading-relaxed"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  disabled={isRunning}
                  placeholder="Describe what the agent should buy…"
                />

                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setTask(p.task)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 ${
                        task === p.task
                          ? 'border-foreground/25 bg-foreground/[0.06] text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    id="launch-agent-btn"
                    onClick={launchAgent}
                    disabled={isRunning || !groqOk || task.trim().length < 10}
                    className="btn-primary flex-1 justify-center !py-2.5 !text-sm"
                  >
                    {launching ? (
                      <><Loader2 size={15} className="animate-spin" /> Starting…</>
                    ) : (
                      <><Play size={15} fill="currentColor" /> Launch agent</>
                    )}
                  </button>
                  <button
                    type="button"
                    id="stop-agent-btn"
                    onClick={stopAgent}
                    disabled={!isRunning || stopping}
                    className="btn-danger !rounded-full !px-4 !py-2.5 inline-flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {stopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={13} fill="currentColor" />}
                    Stop
                  </button>
                </div>

                {!groqOk && (
                  <p className="text-[11px] text-status-pending">
                    Set <span className="font-mono">ANTHROPIC_API_KEY</span> (recommended) or{' '}
                    <span className="font-mono">GROQ_API_KEY</span> in aisle/.env
                  </p>
                )}
                {groqOk && llmProvider && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    LLM: {llmProvider === 'anthropic' ? 'Anthropic Claude' : 'Groq'}
                  </p>
                )}
                {launchError && (
                  <p className="text-[11px] text-status-blocked leading-relaxed">{launchError}</p>
                )}
                {session?.status === 'complete' && (
                  <Link
                    to="/live"
                    className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline"
                  >
                    Open Live Feed audit <ExternalLink size={11} />
                  </Link>
                )}
              </div>
            </div>

            {/* Compact run metrics */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Tools', value: toolCalls, icon: Activity },
                { label: 'Searches', value: catalogSearches, icon: Search },
                { label: 'Events', value: session?.events.length ?? 0, icon: Zap },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="card-elevated !py-3 !px-3 animate-fade-up"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                      <Icon size={11} />
                      <span className="text-[9px] tracking-widest uppercase">{s.label}</span>
                    </div>
                    <div className="text-2xl font-display text-foreground leading-none">{s.value}</div>
                  </div>
                );
              })}
            </div>

            {marketplace?.stores && marketplace.stores.length > 0 && (
              <div className="card-elevated !py-3.5 !px-4">
                <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-2.5">
                  Marketplace
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {marketplace.stores.slice(0, 10).map((s, i) => (
                    <span
                      key={`${s.name}-${i}`}
                      className="text-[10px] px-2 py-1 rounded-md border border-border bg-muted/40 text-muted-foreground"
                    >
                      {s.name}
                      <span className="text-foreground/45 ml-1 font-mono">{s.product_count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {razorpayCheckout?.razorpay_order_id && (
              <div className="card border-green-200/80 bg-green-50/40 !p-4 space-y-3 animate-fade-up">
                <div className="flex items-center gap-2">
                  <Banknote size={14} className="text-green-700" />
                  <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-green-800">
                    Razorpay order
                  </span>
                </div>
                <p className="text-[12px] text-foreground/80 leading-relaxed">
                  Real <span className="font-medium">Orders API</span> create in test mode.
                  Open Razorpay Dashboard → Orders and search this id.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-card px-3 py-2">
                  <code className="font-mono text-[11px] text-foreground flex-1 truncate">
                    {razorpayCheckout.razorpay_order_id}
                  </code>
                  <button type="button" onClick={copyRzpId} className="btn-ghost !px-2 !py-1 !text-[10px]" title="Copy">
                    <Copy size={12} />
                  </button>
                </div>
                {razorpayCheckout.amount_inr != null && (
                  <div className="text-[12px] font-mono text-foreground">
                    ₹{Number(razorpayCheckout.amount_inr).toLocaleString()} · status {razorpayCheckout.status}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={settlePayment}
                    disabled={settling}
                    className="btn-primary !text-[11px] !py-2"
                  >
                    {settling ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Simulate payment.captured
                  </button>
                  <a
                    href="https://dashboard.razorpay.com/app/orders"
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost !text-[11px] !py-2"
                  >
                    Razorpay Dashboard <ExternalLink size={11} />
                  </a>
                </div>
                {settleMsg && (
                  <p className="text-[11px] text-green-800 leading-relaxed">{settleMsg}</p>
                )}
              </div>
            )}
          </div>

          {/* Trace column */}
          <div className="lg:col-span-7">
            <div className="card !p-0 overflow-hidden min-h-[620px] flex flex-col shadow-sm">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-status-blocked/70" />
                    <span className="w-2 h-2 rounded-full bg-status-pending/70" />
                    <span className="w-2 h-2 rounded-full bg-green-500/70" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-foreground">Live agent trace</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {isRunning ? 'streaming tool calls…' : 'waiting for launch'}
                    </div>
                  </div>
                </div>
                {isRunning && (
                  <span className="badge badge-info">
                    <Loader2 size={10} className="animate-spin" /> Live
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {error && (
                  <div className="mb-4 rounded-xl border border-status-blocked/25 bg-status-blocked/5 px-3 py-2.5 text-[12px] text-status-blocked">
                    {error}
                  </div>
                )}

                {!timeline.length && !isRunning && !error && (
                  <div className="empty-state !min-h-[420px]">
                    <div className="empty-state-inner">
                      <div className="empty-state-icon mx-auto">
                        <Brain size={22} className="text-muted-foreground/50" />
                      </div>
                      <p className="font-display text-xl text-foreground mb-1">Ready when you are</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Write a shopping task, hit Launch, and watch the agent discover stores, search catalogs, pass policy, and checkout.
                      </p>
                    </div>
                  </div>
                )}

                {isRunning && !timeline.length && (
                  <div className="flex items-center justify-center gap-2.5 text-foreground py-20">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm">Initializing agent…</span>
                  </div>
                )}

                <div className="relative space-y-0">
                  {timeline.length > 0 && (
                    <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />
                  )}
                  {timeline.map((ev, idx) => {
                    const isFail = ev.type === 'stopped' || ev.type === 'error';
                    const isDone = ev.type === 'done';
                    const isThink = ev.type === 'thinking';
                    return (
                      <div
                        key={ev.id}
                        className="relative pl-10 pb-4 last:pb-0 animate-fade-up"
                        style={{ animationDelay: `${Math.min(idx, 12) * 35}ms` }}
                      >
                        <div
                          className={`absolute left-1.5 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-card shadow-sm ${
                            isFail
                              ? 'border-status-blocked/30'
                              : isDone
                                ? 'border-green-300'
                                : isThink
                                  ? 'border-blue-200'
                                  : 'border-border'
                          }`}
                        >
                          {eventIcon(ev.type, ev.meta)}
                        </div>

                        <div
                          className={`rounded-xl border px-3.5 py-3 transition-colors ${
                            isFail
                              ? 'border-status-blocked/25 bg-status-blocked/[0.04]'
                              : isDone
                                ? 'border-green-200 bg-green-50/80'
                                : isThink
                                  ? 'border-blue-100 bg-blue-50/50'
                                  : 'border-border bg-card'
                          }`}
                        >
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-foreground">
                              {ev.label ?? ev.type}
                            </span>
                            {ev.step != null && (
                              <span className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
                                #{ev.step}
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground/50 ml-auto flex items-center gap-1 mt-0.5">
                              <Clock size={10} /> {formatTime(ev.timestamp)}
                            </span>
                          </div>

                          {ev.detail != null && ev.detail !== '' && (
                            <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed break-words whitespace-pre-wrap">
                              {typeof ev.detail === 'string' ? ev.detail : JSON.stringify(ev.detail, null, 2)}
                            </p>
                          )}

                          {isThink && isRunning && (
                            <p className="text-[11px] text-blue-600 mt-1.5 flex items-center gap-1.5">
                              <Loader2 size={11} className="animate-spin" /> Waiting on model…
                            </p>
                          )}

                          {ev.meta?.duration_ms != null && (
                            <span className="inline-block mt-2 text-[10px] font-mono text-foreground/45">
                              {String(ev.meta.duration_ms)}ms
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
