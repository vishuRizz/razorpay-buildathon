import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useApp } from '../App';
import { ShieldCheck, Save, ToggleLeft, ToggleRight, Sliders, Users, AlertCircle } from 'lucide-react';

interface Policies {
  max_order_value?: number;
  human_review_above?: number;
  daily_ai_gmv_cap?: number;
  allowed_agent_types?: string[];
  discount_cap_percent?: number;
  emergency_stop?: boolean;
}

const AGENT_TYPES = ['shopping', 'travel', 'enterprise', 'personal', 'research'];

function SliderField({
  id, label, desc, value, min, max, step = 500, prefix = '₹', onChange,
}: {
  id: string; label: string; desc: string; value: number; min: number; max: number;
  step?: number; prefix?: string; onChange: (n: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex justify-between items-start mb-1">
        <div>
          <label htmlFor={id} className="text-xs text-foreground/80 font-medium tracking-wide">{label}</label>
          <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
        </div>
        <span className="text-foreground font-bold font-mono text-sm shrink-0 ml-4">
          {prefix}{value?.toLocaleString()}
        </span>
      </div>
      <div className="relative mt-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
          style={{
            background: `linear-gradient(to right, var(--foreground) ${pct}%, var(--border) ${pct}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/50 font-mono mt-1">
        <span>{prefix}{min.toLocaleString()}</span>
        <span>{prefix}{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function PolicyEditor() {
  const { merchantId } = useApp();
  const [aiEnabled, setAiEnabled] = useState(true);
  const [policies, setPolicies] = useState<Policies>({
    max_order_value: 10000,
    human_review_above: 2000,
    daily_ai_gmv_cap: 50000,
    discount_cap_percent: 10,
    allowed_agent_types: ['shopping', 'travel'],
    emergency_stop: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!merchantId) return;
    axios.get(`/v1/merchants/${merchantId}`).then(({ data }) => {
      setAiEnabled(data.ai_buyers_enabled);
      setPolicies((p) => ({ ...p, ...data.policies }));
    }).catch(() => {});
  }, [merchantId]);

  const save = async () => {
    if (!merchantId) return;
    setSaving(true);
    try {
      await axios.patch(`/v1/merchants/${merchantId}/policies`, {
        ai_buyers_enabled: aiEnabled,
        policies,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Save failed. Check console.');
    } finally {
      setSaving(false);
    }
  };

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full grid-mesh">
        <div className="text-center animate-fade-up">
          <div className="w-14 h-14 mx-auto mb-4 border border-foreground/10 rounded flex items-center justify-center bg-green-primary/5 ">
            <ShieldCheck size={22} className="text-foreground" />
          </div>
          <h2 className="text-sm font-bold text-foreground tracking-widest mb-2">POLICY_ENGINE</h2>
          <p className="text-xs text-muted-foreground font-mono">Set your Merchant ID in the sidebar panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl animate-fade-up bg-background min-h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={16} className="text-foreground" />
        <h1 className="text-sm font-bold text-foreground tracking-widest">POLICY_ENGINE</h1>
      </div>
      <p className="text-[10px] text-muted-foreground font-mono mb-6">
        Configure AI buyer rules. Changes take effect immediately for all future agent calls.
      </p>

      {/* Kill Switch */}
      <div className="card  mb-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-primary/40 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded border flex items-center justify-center transition-all ${
              aiEnabled ? 'border-foreground/15 bg-foreground/5' : 'border-status-blocked/30 bg-status-blocked/10'
            }`}>
              <ShieldCheck size={14} className={aiEnabled ? 'text-foreground' : 'text-status-blocked'} />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground tracking-wide">AI_BUYERS_ENABLED</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                {aiEnabled
                  ? 'Agents can discover and purchase from your store'
                  : 'All AI agent access is paused — no purchases allowed'}
              </div>
            </div>
          </div>
          <button
            id="toggle-ai-buyers"
            onClick={() => setAiEnabled(!aiEnabled)}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            {aiEnabled
              ? <ToggleRight size={32} className="text-foreground" strokeWidth={1.5} />
              : <ToggleLeft size={32} className="text-status-blocked" strokeWidth={1.5} />
            }
          </button>
        </div>
      </div>

      {/* BIG RED KILL SWITCH */}
      <div className="card  mb-4 relative overflow-hidden bg-status-blocked/5 border-status-blocked/30">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-status-blocked/60 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded border flex items-center justify-center transition-all border-status-blocked/40 bg-status-blocked/20 glow-red`}>
              <AlertCircle size={14} className="text-status-blocked" />
            </div>
            <div>
              <div className="text-xs font-bold text-status-blocked tracking-wide">EMERGENCY_STOP</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                {policies.emergency_stop
                  ? 'CRITICAL OVERRIDE ACTIVE — All AI commerce globally hard-blocked'
                  : 'Activate to instantly halt all AI transactions across this store'}
              </div>
            </div>
          </div>
          <button
            id="toggle-emergency-stop"
            onClick={() => setPolicies({ ...policies, emergency_stop: !policies.emergency_stop })}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            {policies.emergency_stop
              ? <ToggleRight size={32} className="text-status-blocked glow-red" strokeWidth={1.5} />
              : <ToggleLeft size={32} className="text-muted-foreground/40" strokeWidth={1.5} />
            }
          </button>
        </div>
      </div>

      {/* Thresholds */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Sliders size={12} className="text-foreground" />
          <h2 className="text-[10px] font-medium text-foreground/80 tracking-widest">ORDER_THRESHOLDS</h2>
        </div>
        <SliderField
          id="slider-human-review"
          label="Human Review Threshold"
          desc="Orders above this value require merchant approval before processing"
          value={policies.human_review_above ?? 2000}
          min={500}
          max={10000}
          onChange={(v) => setPolicies({ ...policies, human_review_above: v })}
        />
        <SliderField
          id="slider-max-order"
          label="Max Order Value"
          desc="Hard cap — agents cannot create orders above this limit"
          value={policies.max_order_value ?? 10000}
          min={500}
          max={50000}
          step={1000}
          onChange={(v) => setPolicies({ ...policies, max_order_value: v })}
        />
        <SliderField
          id="slider-gmv-cap"
          label="Daily AI GMV Cap"
          desc="Maximum AI-driven GMV allowed per calendar day"
          value={policies.daily_ai_gmv_cap ?? 50000}
          min={5000}
          max={500000}
          step={5000}
          onChange={(v) => setPolicies({ ...policies, daily_ai_gmv_cap: v })}
        />
        <SliderField
          id="slider-discount-cap"
          label="Discount Cap"
          desc="Maximum discount an agent can apply to any order"
          value={policies.discount_cap_percent ?? 10}
          min={0}
          max={50}
          step={5}
          prefix="%"
          onChange={(v) => setPolicies({ ...policies, discount_cap_percent: v })}
        />
      </div>

      {/* Agent Types */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Users size={12} className="text-foreground" />
          <h2 className="text-[10px] font-medium text-foreground/80 tracking-widest">ALLOWED_AGENT_TYPES</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {AGENT_TYPES.map((type) => {
            const active = policies.allowed_agent_types?.includes(type) ?? false;
            return (
              <button
                key={type}
                id={`agent-type-${type}`}
                onClick={() => {
                  const current = policies.allowed_agent_types ?? [];
                  const updated = active ? current.filter((t) => t !== type) : [...current, type];
                  setPolicies({ ...policies, allowed_agent_types: updated });
                }}
                className={`px-3 py-1.5 rounded text-[10px] font-mono font-medium tracking-wider transition-all duration-200 border ${
                  active
                    ? 'bg-foreground/5 text-foreground border-foreground/15 '
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/10 hover:text-foreground/80'
                }`}
              >
                {type.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          id="save-policies"
          onClick={save}
          disabled={saving}
          className="btn-primary px-6 py-2.5"
        >
          <Save size={13} />
          {saving ? 'SAVING...' : 'SAVE_CHANGES'}
        </button>
        {saved && (
          <div className="flex items-center gap-1.5 text-status-approved text-[10px] font-mono animate-fade-in">
            <AlertCircle size={11} />
            POLICIES_UPDATED · EFFECTIVE_IMMEDIATELY
          </div>
        )}
      </div>
    </div>
  );
}
