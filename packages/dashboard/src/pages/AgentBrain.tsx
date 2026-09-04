import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import {
  Brain, Radio, Search, Store, ShieldCheck, CreditCard, CheckCircle2,
  XCircle, Loader2, Zap, Clock, Play, Sparkles, ExternalLink, Square,
  ArrowRight, Headphones, Package
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
  'Surprise me — buy something useful under ₹2,000 from any store on AISLE. Explore all catalogs, compare different product types, and pick the best match for a general shopper.';

const PRESETS = [
  { label: 'Surprise me', task: DEFAULT_TASK },
  { label: 'Book + snack', task: 'Buy a paperback book and an organic snack under ₹1,000. Search BookNook and GreenSpoon.' },
  { label: 'Home office', task: 'Set up a home office under ₹5,000 — monitor accessories or desk gear from TechVault and HomeBasics.' },
  { label: 'Pet care', task: 'Buy something for my dog under ₹1,500 from PetPals — food, toy, or bed.' },
  { label: 'Skincare', task: 'Build a basic skincare routine under ₹2,000 from BeautyBar.' },
  { label: 'Kids gift', task: 'Find a fun gift for an 8-year-old under ₹1,500 from KidZone.' },
  { label: 'Fitness', task: 'Buy home workout gear under ₹1,500 from FitZone.' },
  { label: 'Goa WiFi', task: 'Buy portable WiFi for Goa under ₹3,000. Compare all connectivity stores.' },
];

const CATALOG_HIGHLIGHTS = [
  { store: 'TechVault', name: '27" 4K IPS Monitor', price: '₹24,999', detail: 'USB-C · sRGB', icon: Package },
  { store: 'BookNook', name: 'Atomic Habits', price: '₹399', detail: 'Paperback', icon: Package },
  { store: 'BeautyBar', name: 'Vitamin C Serum', price: '₹899', detail: '30ml · brightening', icon: Sparkles },
  { store: 'PetPals', name: 'Orthopedic Dog Bed', price: '₹2,499', detail: 'Medium · memory foam', icon: Package },
  { store: 'GreenSpoon', name: 'Organic Granola', price: '₹449', detail: '500g · no palm oil', icon: Package },
  { store: 'GadgetNest', name: 'boAt Airdopes 441', price: '₹1,799', detail: 'TWS · IPX5', icon: Headphones },
];

const PIPELINE = [
  { id: 'task', label: 'Task', icon: Zap },
  { id: 'discover', label: 'Discover', icon: Store },
  { id: 'compare', label: 'Compare', icon: Search },
  { id: 'policy', label: 'Policy', icon: ShieldCheck },
  { id: 'checkout', label: 'Checkout', icon: CreditCard },
] as const;

function eventIcon(type: string, meta?: Record<string, unknown>) {
  const tool = meta?.tool as string | undefined;
  if (type === 'session_start' || type === 'stop_requested' || type === 'stopped') {
    return type === 'stopped' ? (
      <Square size={13} className="text-status-blocked" />
    ) : (
      <Zap size={13} className="text-foreground" />
    );
  }
  if (type === 'done') return <CheckCircle2 size={13} className="text-green-600" />;
  if (type === 'error') return <XCircle size={13} className="text-status-blocked" />;
  if (tool === 'discover_stores') return <Store size={13} className="text-blue-600" />;
  if (tool === 'search_catalog') return <Search size={13} className="text-blue-600" />;
  if (tool === 'create_cart') return <ShieldCheck size={13} className="text-status-pending" />;
  if (tool === 'checkout') return <CreditCard size={13} className="text-foreground" />;
  if (tool === 'check_order_status') return <CheckCircle2 size={13} className="text-green-600" />;
  return <Brain size={13} className="text-muted-foreground" />;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function collapseEvents(events: AgentEvent[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  const skip = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (skip.has(ev.id) || ev.type === 'thinking') continue;

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

function statusLabel(status?: AgentSession['status']) {
  switch (status) {
    case 'running': return { text: 'RUNNING', className: 'text-foreground' };
    case 'complete': return { text: 'COMPLETE', className: 'text-green-600' };
    case 'stopped': return { text: 'STOPPED', className: 'text-status-pending' };
    case 'error': return { text: 'ERROR', className: 'text-status-blocked' };
    default: return { text: 'IDLE', className: 'text-muted-foreground' };
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
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const fetchSession = useCallback(async () => {
    try {
      const [{ data: latest }, { data: status }] = await Promise.all([
        axios.get<{ session: AgentSession | null }>('/v1/agent-events/latest'),
        axios.get<{ running: boolean; groq_configured: boolean }>('/v1/agent/run/status'),
      ]);
      setSession(latest.session);
      setGroqOk(status.groq_configured);
      setError('');
    } catch {
      setError('Cannot reach API — is pnpm dev running?');
    }
  }, []);

  useEffect(() => {
    fetchSession();
    const ms = session?.status === 'running' ? 700 : 3000;
    const interval = setInterval(fetchSession, ms);
    return () => clearInterval(interval);
  }, [fetchSession, session?.status]);

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
      await axios.post('/v1/agent/run', { task });
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
      await axios.post('/v1/agent/stop', { session_id: session?.session_id });
      await fetchSession();
    } catch (err: unknown) {
      setLaunchError(
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to stop agent'
      );
    } finally {
      setStopping(false);
    }
  };

  const isRunning = session?.status === 'running' || launching;
  const timeline = collapseEvents(session?.events ?? []);
  const pipe = useMemo(() => pipelineState(session?.events ?? []), [session?.events]);
  const st = statusLabel(session?.status);
  const toolCalls = session?.events.filter((e) => e.type === 'tool_result').length ?? 0;
  const catalogSearches =
    session?.events.filter((e) => e.type === 'tool_result' && e.meta?.tool === 'search_catalog').length ?? 0;

  return (
    <div className="min-h-full bg-background">
      <div className="relative p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <PageHeader
          eyebrow="Autonomous Buyer"
          title="Agent Brain"
          subtitle="13-store marketplace · 128 products · books, beauty, pets, tech, food, fitness, travel & more. Launch any shopping task."
          icon={
            <div className="p-2.5 rounded-xl bg-foreground/5 border border-foreground/10">
              <Brain size={22} className="text-foreground" />
            </div>
          }
          badge={
            session?.status === 'running' ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                <Radio size={10} className="live-dot" /> Live
              </span>
            ) : undefined
          }
          actions={
            <div className="glass px-4 py-3 text-right">
              <div className={`text-sm font-semibold font-mono ${st.className}`}>{st.text}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {session?.session_id?.slice(0, 16) ?? '—'}
              </div>
            </div>
          }
        />

        {/* Pipeline */}
        <div className="card py-4 px-5 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {PIPELINE.map((stage, i) => {
              const done = pipe[stage.id as keyof typeof pipe];
              const active = isRunning && !done && (i === 0 || pipe[PIPELINE[i - 1].id as keyof typeof pipe]);
              const Icon = stage.icon;
              return (
                <React.Fragment key={stage.id}>
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 ${
                      done
                        ? 'bg-foreground/5 border-foreground/15 text-foreground'
                        : active
                          ? 'bg-blue-50 border-blue-200 text-blue-600'
                          : 'bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="text-[10px] font-medium tracking-wide">{stage.label}</span>
                    {done && <CheckCircle2 size={12} className="opacity-80" />}
                    {active && <Loader2 size={12} className="animate-spin" />}
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight size={14} className="text-muted-foreground/40 shrink-0 mx-0.5" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-5">
          {/* Left column */}
          <div className="lg:col-span-5 space-y-4">
            {/* Launch card */}
            <div className="card border-foreground/10 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-primary/[0.06] to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={14} className="text-foreground" />
                  <span className="text-[10px] text-foreground tracking-widest font-semibold">MISSION_CONTROL</span>
                </div>
                <textarea
                  className="input-field w-full text-xs min-h-[80px] resize-none mb-3 bg-background/80"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  disabled={isRunning}
                />
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setTask(p.task)}
                      className="text-[10px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-40"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    id="launch-agent-btn"
                    onClick={launchAgent}
                    disabled={isRunning || !groqOk || task.trim().length < 10}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 text-xs py-2.5 disabled:opacity-40"
                  >
                    {launching ? (
                      <><Loader2 size={14} className="animate-spin" /> Starting…</>
                    ) : (
                      <><Play size={14} fill="currentColor" /> Launch Agent</>
                    )}
                  </button>
                  <button
                    type="button"
                    id="stop-agent-btn"
                    onClick={stopAgent}
                    disabled={!isRunning || stopping}
                    className="flex items-center justify-center gap-2 text-xs py-2.5 px-4 rounded-md border border-status-blocked/40 text-status-blocked bg-status-blocked/10 hover:bg-status-blocked/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {stopping ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Square size={14} fill="currentColor" />
                    )}
                    Stop
                  </button>
                </div>
                {!groqOk && (
                  <p className="text-[10px] text-status-pending mt-3">Set GROQ_API_KEY in .env</p>
                )}
                {launchError && (
                  <p className="text-[10px] text-status-blocked mt-3">{launchError}</p>
                )}
                {session?.status === 'complete' && (
                  <Link to="/live" className="inline-flex items-center gap-1 text-[10px] text-blue-600 mt-3 hover:underline">
                    View audit in Live Feed <ExternalLink size={10} />
                  </Link>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'TOOLS', value: toolCalls },
                { label: 'SEARCHES', value: catalogSearches },
                { label: 'EVENTS', value: session?.events.length ?? 0 },
              ].map((s) => (
                <div key={s.label} className="card-elevated py-3 px-3 text-center">
                  <div className="text-lg font-bold text-foreground">{s.value}</div>
                  <div className="text-[8px] text-muted-foreground tracking-widest mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Marketplace overview */}
            <div className="card-elevated p-3 space-y-3">
              <div className="text-[9px] text-muted-foreground tracking-widest">LIVE MARKETPLACE</div>
              {marketplace ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'STORES', value: marketplace.store_count },
                      { label: 'PRODUCTS', value: marketplace.product_count },
                      { label: 'CATEGORIES', value: marketplace.category_count },
                    ].map((s) => (
                      <div key={s.label} className="text-center">
                        <div className="text-xl font-bold font-mono text-foreground">{s.value}</div>
                        <div className="text-[8px] text-muted-foreground tracking-widest">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {marketplace.price_range_inr && (
                    <div className="text-[10px] text-muted-foreground font-mono text-center">
                      ₹{marketplace.price_range_inr.min.toLocaleString()} – ₹{marketplace.price_range_inr.max.toLocaleString()}
                    </div>
                  )}
                  {marketplace.stores && marketplace.stores.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {marketplace.stores.slice(0, 12).map((s) => (
                        <span
                          key={s.name}
                          className="text-[9px] px-2 py-0.5 rounded-full border border-border bg-muted/60 text-muted-foreground font-mono"
                        >
                          {s.name}
                          <span className="text-foreground/50 ml-1">{s.product_count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[10px] text-muted-foreground font-mono text-center py-2">Loading marketplace…</div>
              )}
            </div>

            {/* Catalog highlights */}
            <div className="space-y-2">
              <div className="text-[9px] text-muted-foreground tracking-widest px-1">SAMPLE LISTINGS</div>
              {CATALOG_HIGHLIGHTS.map((p) => {
                const Icon = p.icon;
                return (
                <div
                  key={`${p.store}-${p.name}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50 transition-colors"
                >
                  <div className="p-2 rounded-md bg-muted">
                    <Icon size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground">{p.store}</div>
                    <div className="text-xs text-foreground font-medium truncate">{p.name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-foreground">{p.price}</div>
                    <div className="text-[9px] text-muted-foreground">{p.detail}</div>
                  </div>
                </div>
              );})}
            </div>
          </div>

          {/* Trace panel */}
          <div className="lg:col-span-7">
            <div className="card min-h-[560px] flex flex-col p-0 overflow-hidden border-border">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/80">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-blocked/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-status-pending/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-[10px] text-muted-foreground tracking-widest ml-2">agent_trace.log</span>
                </div>
                {isRunning && <Loader2 size={14} className="text-foreground animate-spin" />}
              </div>

              <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px]">
                {error && <p className="text-status-blocked mb-4">{error}</p>}

                {!timeline.length && !isRunning && !error && (
                  <div className="h-full flex flex-col items-center justify-center text-center py-16">
                    <Brain size={40} className="text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground text-xs">Ready for mission</p>
                    <p className="text-muted-foreground/50 text-[10px] mt-2 max-w-xs">
                      Launch an agent to stream tool calls here in real time
                    </p>
                  </div>
                )}

                {isRunning && !timeline.length && (
                  <div className="flex items-center gap-2 text-foreground py-8 justify-center">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Initializing agent…</span>
                  </div>
                )}

                <div className="space-y-3">
                  {timeline.map((ev, idx) => (
                    <div
                      key={ev.id}
                      className={`animate-fade-up rounded-lg border px-3 py-2.5 ${
                        ev.type === 'stopped' || ev.type === 'error'
                          ? 'border-status-blocked/30 bg-status-blocked/5'
                          : ev.type === 'done'
                            ? 'border-green-200 bg-green-50'
                            : 'border-border bg-background/60'
                      }`}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 p-1.5 rounded-md bg-muted border border-border shrink-0">
                          {eventIcon(ev.type, ev.meta)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-foreground font-medium">{ev.label ?? ev.type}</span>
                            {ev.step != null && (
                              <span className="text-[9px] text-muted-foreground/70">#{ev.step}</span>
                            )}
                            <span className="text-[9px] text-muted-foreground/50 ml-auto flex items-center gap-1">
                              <Clock size={9} /> {formatTime(ev.timestamp)}
                            </span>
                          </div>
                          {ev.detail && (
                            <p className="text-muted-foreground mt-1.5 leading-relaxed break-words whitespace-pre-wrap">
                              {ev.detail}
                            </p>
                          )}
                          {ev.meta?.duration_ms != null && (
                            <span className="text-[9px] text-foreground/60">{String(ev.meta.duration_ms)}ms</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
