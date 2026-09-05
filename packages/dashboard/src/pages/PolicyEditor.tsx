import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useApp } from '../App';
import PageHeader from '../components/PageHeader';
import {
  ShieldCheck, Save, ToggleLeft, ToggleRight, Sliders, Users,
  AlertCircle, Plus, X, FilePlus2, Ban, Layers, Trash2, Power
} from 'lucide-react';

interface CustomPolicyRule {
  id: string;
  name: string;
  description?: string;
  rule_type: 'spend_cap' | 'category_block' | 'velocity' | 'geo_restrict' | 'custom';
  threshold?: string;
  action: 'block' | 'review' | 'warn';
  enabled?: boolean;
  created_at?: string;
}

interface Policies {
  max_order_value?: number;
  human_review_above?: number;
  daily_ai_gmv_cap?: number;
  allowed_agent_types?: string[];
  discount_cap_percent?: number;
  emergency_stop?: boolean;
  custom_rules?: CustomPolicyRule[];
}

interface CustomPolicyDraft {
  name: string;
  description: string;
  rule_type: CustomPolicyRule['rule_type'];
  threshold: string;
  action: CustomPolicyRule['action'];
}

const AGENT_TYPES = ['shopping', 'travel', 'enterprise', 'personal', 'research'];

const RULE_TYPES = [
  { id: 'spend_cap' as const, label: 'Spend cap' },
  { id: 'category_block' as const, label: 'Category block' },
  { id: 'velocity' as const, label: 'Velocity limit' },
  { id: 'geo_restrict' as const, label: 'Geo restrict' },
  { id: 'custom' as const, label: 'Custom rule' },
];

const RULE_ACTIONS = [
  { id: 'block' as const, label: 'Block checkout' },
  { id: 'review' as const, label: 'Require human review' },
  { id: 'warn' as const, label: 'Warn only' },
];

const EMPTY_DRAFT: CustomPolicyDraft = {
  name: '',
  description: '',
  rule_type: 'spend_cap',
  threshold: '',
  action: 'block',
};

function ruleTypeLabel(id: string) {
  return RULE_TYPES.find((r) => r.id === id)?.label ?? id;
}

function actionLabel(id: string) {
  return RULE_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

function SliderField({
  id, label, desc, value, min, max, step = 500, prefix = '₹', onChange,
}: {
  id: string; label: string; desc: string; value: number; min: number; max: number;
  step?: number; prefix?: string; onChange: (n: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex justify-between items-start mb-1 gap-4">
        <div>
          <label htmlFor={id} className="text-[13px] text-foreground font-medium tracking-wide">
            {label}
          </label>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <span className="text-foreground font-display text-lg shrink-0 tabular-nums">
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
    custom_rules: [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<CustomPolicyDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState('');

  const customRules = policies.custom_rules ?? [];

  useEffect(() => {
    if (!merchantId) return;
    axios.get(`/v1/merchants/${merchantId}`).then(({ data }) => {
      setAiEnabled(data.ai_buyers_enabled);
      setPolicies((p) => ({
        ...p,
        ...data.policies,
        custom_rules: data.policies?.custom_rules ?? [],
      }));
    }).catch(() => {});
  }, [merchantId]);

  const persistPolicies = async (
    next: Policies,
    nextAi = aiEnabled,
  ): Promise<boolean> => {
    if (!merchantId) return false;
    await axios.patch(`/v1/merchants/${merchantId}/policies`, {
      ai_buyers_enabled: nextAi,
      policies: next,
    });
    return true;
  };

  const save = async () => {
    if (!merchantId) return;
    setSaving(true);
    try {
      await persistPolicies(policies, aiEnabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Save failed. Check console.');
    } finally {
      setSaving(false);
    }
  };

  const openAddForm = () => {
    setDraft(EMPTY_DRAFT);
    setDraftError('');
    setShowAddForm(true);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setDraftError('');
  };

  const submitCustomPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantId) return;

    const name = draft.name.trim();
    if (!name) {
      setDraftError('Give the policy a name.');
      return;
    }
    if (
      (draft.rule_type === 'spend_cap' || draft.rule_type === 'category_block') &&
      !draft.threshold.trim()
    ) {
      setDraftError(
        draft.rule_type === 'spend_cap'
          ? 'Enter a spend cap amount (e.g. 5000).'
          : 'Enter a category to block (e.g. electronics).',
      );
      return;
    }

    const rule: CustomPolicyRule = {
      id: `rule_${crypto.randomUUID().slice(0, 8)}`,
      name,
      description: draft.description.trim() || undefined,
      rule_type: draft.rule_type,
      threshold: draft.threshold.trim() || undefined,
      action: draft.action,
      enabled: true,
      created_at: new Date().toISOString(),
    };

    const next: Policies = {
      ...policies,
      custom_rules: [...customRules, rule],
    };

    setCreating(true);
    setDraftError('');
    try {
      await persistPolicies(next, aiEnabled);
      setPolicies(next);
      closeAddForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setDraftError('Could not save policy. Is the API running?');
    } finally {
      setCreating(false);
    }
  };

  const toggleRule = async (id: string) => {
    const next: Policies = {
      ...policies,
      custom_rules: customRules.map((r) =>
        r.id === id ? { ...r, enabled: r.enabled === false } : r,
      ),
    };
    setPolicies(next);
    try {
      await persistPolicies(next, aiEnabled);
    } catch {
      alert('Failed to update rule.');
      setPolicies(policies);
    }
  };

  const deleteRule = async (id: string) => {
    const next: Policies = {
      ...policies,
      custom_rules: customRules.filter((r) => r.id !== id),
    };
    setPolicies(next);
    try {
      await persistPolicies(next, aiEnabled);
    } catch {
      alert('Failed to delete rule.');
      setPolicies(policies);
    }
  };

  if (!merchantId) {
    return (
      <div className="min-h-full relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 45% at 15% -5%, color-mix(in oklch, var(--status-info) 8%, transparent), transparent 55%)',
          }}
        />
        <div className="empty-state relative">
          <div className="empty-state-inner">
            <div className="empty-state-icon mx-auto">
              <ShieldCheck size={22} className="text-muted-foreground/60" />
            </div>
            <h2 className="font-display text-2xl text-foreground mb-2">Policy Engine</h2>
            <p className="text-sm text-muted-foreground">
              Set your Merchant ID in the sidebar to edit AI buyer rules.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 8% -10%, color-mix(in oklch, var(--status-info) 7%, transparent), transparent 55%), radial-gradient(ellipse 50% 35% at 95% 5%, color-mix(in oklch, var(--status-blocked) 5%, transparent), transparent 45%)',
        }}
      />

      <div className="relative p-6 lg:p-8 max-w-3xl mx-auto space-y-5 animate-fade-up">
        <PageHeader
          eyebrow="Safety Controls"
          title="Policy Engine"
          subtitle="Tune AI buyer limits. Changes apply to the next agent call."
          icon={
            <div className="p-2.5 rounded-2xl bg-foreground/[0.04] border border-foreground/10 shadow-sm">
              <ShieldCheck size={22} className="text-foreground" />
            </div>
          }
          actions={
            <button type="button" onClick={openAddForm} className="btn-primary !py-2.5">
              <Plus size={14} />
              Add policy
            </button>
          }
        />

        {/* Status strip */}
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${aiEnabled ? 'badge-approved' : 'badge-blocked'}`}>
            {aiEnabled ? 'AI buyers on' : 'AI buyers off'}
          </span>
          <span className={`badge ${policies.emergency_stop ? 'badge-blocked' : 'badge-neutral'}`}>
            {policies.emergency_stop ? 'Emergency stop' : 'Store live'}
          </span>
          <span className="badge badge-info">
            <Layers size={9} />
            {policies.allowed_agent_types?.length ?? 0} agent types
          </span>
          {customRules.length > 0 && (
            <span className="badge badge-neutral">
              {customRules.filter((r) => r.enabled !== false).length} custom active
            </span>
          )}
        </div>

        {/* Kill switches */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card !p-4 relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    aiEnabled
                      ? 'border-foreground/15 bg-foreground/5'
                      : 'border-status-blocked/30 bg-status-blocked/10'
                  }`}
                >
                  <ShieldCheck size={15} className={aiEnabled ? 'text-foreground' : 'text-status-blocked'} />
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-foreground">AI buyers</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {aiEnabled
                      ? 'Agents can discover and buy from this store'
                      : 'All AI agent access paused'}
                  </p>
                </div>
              </div>
              <button
                id="toggle-ai-buyers"
                type="button"
                onClick={() => setAiEnabled(!aiEnabled)}
                aria-label="Toggle AI buyers"
              >
                {aiEnabled ? (
                  <ToggleRight size={34} className="text-foreground" strokeWidth={1.5} />
                ) : (
                  <ToggleLeft size={34} className="text-status-blocked" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          <div className="card !p-4 relative overflow-hidden border-status-blocked/25 bg-status-blocked/[0.03]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl border border-status-blocked/35 bg-status-blocked/10 flex items-center justify-center shrink-0">
                  <Ban size={15} className="text-status-blocked" />
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-status-blocked">Emergency stop</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {policies.emergency_stop
                      ? 'Hard block - all AI commerce halted'
                      : 'Instant halt for every AI transaction'}
                  </p>
                </div>
              </div>
              <button
                id="toggle-emergency-stop"
                type="button"
                onClick={() => setPolicies({ ...policies, emergency_stop: !policies.emergency_stop })}
                aria-label="Toggle emergency stop"
              >
                {policies.emergency_stop ? (
                  <ToggleRight size={34} className="text-status-blocked" strokeWidth={1.5} />
                ) : (
                  <ToggleLeft size={34} className="text-muted-foreground/40" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Thresholds */}
        <div className="card !p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sliders size={13} className="text-foreground" />
            <h2 className="text-[10px] font-semibold tracking-[0.14em] uppercase text-foreground">
              Order thresholds
            </h2>
          </div>
          <SliderField
            id="slider-human-review"
            label="Human review threshold"
            desc="Orders above this require merchant approval"
            value={policies.human_review_above ?? 2000}
            min={500}
            max={10000}
            onChange={(v) => setPolicies({ ...policies, human_review_above: v })}
          />
          <SliderField
            id="slider-max-order"
            label="Max order value"
            desc="Hard cap - agents cannot exceed this"
            value={policies.max_order_value ?? 10000}
            min={500}
            max={50000}
            step={1000}
            onChange={(v) => setPolicies({ ...policies, max_order_value: v })}
          />
          <SliderField
            id="slider-gmv-cap"
            label="Daily AI GMV cap"
            desc="Max AI-driven GMV per calendar day"
            value={policies.daily_ai_gmv_cap ?? 50000}
            min={5000}
            max={500000}
            step={5000}
            onChange={(v) => setPolicies({ ...policies, daily_ai_gmv_cap: v })}
          />
          <SliderField
            id="slider-discount-cap"
            label="Discount cap"
            desc="Max discount an agent can negotiate"
            value={policies.discount_cap_percent ?? 10}
            min={0}
            max={50}
            step={5}
            prefix="%"
            onChange={(v) => setPolicies({ ...policies, discount_cap_percent: v })}
          />
        </div>

        {/* Agent types */}
        <div className="card !p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={13} className="text-foreground" />
            <h2 className="text-[10px] font-semibold tracking-[0.14em] uppercase text-foreground">
              Allowed agent types
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {AGENT_TYPES.map((type) => {
              const active = policies.allowed_agent_types?.includes(type) ?? false;
              return (
                <button
                  key={type}
                  id={`agent-type-${type}`}
                  type="button"
                  onClick={() => {
                    const current = policies.allowed_agent_types ?? [];
                    const updated = active
                      ? current.filter((t) => t !== type)
                      : [...current, type];
                    setPolicies({ ...policies, allowed_agent_types: updated });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium tracking-wider transition-all border ${
                    active
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom policies */}
        <div className="card !p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FilePlus2 size={13} className="text-foreground" />
              <h2 className="text-[10px] font-semibold tracking-[0.14em] uppercase text-foreground">
                Custom policies
              </h2>
            </div>
            <button type="button" onClick={openAddForm} className="btn-ghost !text-[11px] !py-1.5">
              <Plus size={12} />
              Add
            </button>
          </div>

          {customRules.length === 0 ? (
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              No custom rules yet. Use <span className="text-foreground font-medium">Add policy</span> to
              create one - it is enforced on the next checkout.
            </p>
          ) : (
            <ul className="space-y-2">
              {customRules.map((rule) => {
                const on = rule.enabled !== false;
                return (
                  <li
                    key={rule.id}
                    className={`rounded-xl border px-3.5 py-3 transition-opacity ${
                      on
                        ? 'border-border bg-muted/30'
                        : 'border-border/60 bg-transparent opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-foreground truncate">
                          {rule.name}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="badge badge-neutral">{ruleTypeLabel(rule.rule_type)}</span>
                          <span
                            className={`badge ${
                              rule.action === 'block'
                                ? 'badge-blocked'
                                : rule.action === 'review'
                                  ? 'badge-pending'
                                  : 'badge-info'
                            }`}
                          >
                            {actionLabel(rule.action)}
                          </span>
                          {rule.threshold && (
                            <span className="badge badge-neutral font-mono">{rule.threshold}</span>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                            {rule.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="btn-ghost !p-2"
                          aria-label={on ? 'Disable rule' : 'Enable rule'}
                          title={on ? 'Disable' : 'Enable'}
                          onClick={() => toggleRule(rule.id)}
                        >
                          <Power size={13} className={on ? 'text-foreground' : 'text-muted-foreground'} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !p-2 text-status-blocked"
                          aria-label="Delete rule"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-4 pb-6">
          <button
            id="save-policies"
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-primary !px-6 !py-2.5"
          >
            <Save size={13} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <div className="flex items-center gap-1.5 text-status-approved text-[11px] animate-fade-up">
              <AlertCircle size={12} />
              Policies updated · effective immediately
            </div>
          )}
        </div>
      </div>

      {/* Add Policy modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={closeAddForm}
          />
          <div className="relative w-full max-w-md card !p-0 shadow-xl animate-fade-up overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <Plus size={15} className="text-foreground" />
                <div>
                  <div className="text-[13px] font-semibold text-foreground">Add policy</div>
                  <div className="text-[10px] text-muted-foreground">Saved to merchant policies</div>
                </div>
              </div>
              <button type="button" onClick={closeAddForm} className="btn-ghost !p-2" aria-label="Close form">
                <X size={14} />
              </button>
            </div>

            <form onSubmit={submitCustomPolicy} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase block mb-1.5">
                  Policy name
                </label>
                <input
                  className="input-field !font-[inherit] text-sm"
                  placeholder="e.g. Cap single cart at ₹5,000"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase block mb-1.5">
                  Description
                </label>
                <textarea
                  className="input-field !font-[inherit] text-sm min-h-[72px] resize-none"
                  placeholder="What should this rule enforce?"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase block mb-1.5">
                    Rule type
                  </label>
                  <select
                    className="input-field !font-[inherit] text-sm"
                    value={draft.rule_type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rule_type: e.target.value as CustomPolicyRule['rule_type'],
                      })
                    }
                  >
                    {RULE_TYPES.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase block mb-1.5">
                    Action
                  </label>
                  <select
                    className="input-field !font-[inherit] text-sm"
                    value={draft.action}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        action: e.target.value as CustomPolicyRule['action'],
                      })
                    }
                  >
                    {RULE_ACTIONS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase block mb-1.5">
                  Threshold / value
                </label>
                <input
                  className="input-field !font-[inherit] text-sm"
                  placeholder={
                    draft.rule_type === 'spend_cap'
                      ? 'e.g. 5000'
                      : draft.rule_type === 'category_block'
                        ? 'e.g. electronics'
                        : 'optional'
                  }
                  value={draft.threshold}
                  onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
                />
              </div>

              {draftError && (
                <p className="text-[11px] text-status-blocked leading-relaxed rounded-lg border border-status-blocked/25 bg-status-blocked/5 px-3 py-2">
                  {draftError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-primary flex-1 justify-center !py-2.5"
                >
                  <FilePlus2 size={13} />
                  {creating ? 'Saving…' : 'Create policy'}
                </button>
                <button type="button" onClick={closeAddForm} className="btn-ghost !py-2.5">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
