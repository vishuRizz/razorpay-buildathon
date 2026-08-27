import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useApp } from '../App';

interface Policies {
  max_order_value?: number;
  human_review_above?: number;
  daily_ai_gmv_cap?: number;
  allowed_agent_types?: string[];
  discount_cap_percent?: number;
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
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!merchantId) return;
    axios.get(`/v1/merchants/${merchantId}`).then(({ data }) => {
      setAiEnabled(data.ai_buyers_enabled);
      setPolicies({ ...policies, ...data.policies });
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
    } catch (err) {
      alert('Save failed. Check console.');
    } finally {
      setSaving(false);
    }
  };

  const SliderField = ({
    id, label, value, min, max, step = 500, prefix = '₹', onChange,
  }: { id: string; label: string; value: number; min: number; max: number; step?: number; prefix?: string; onChange: (n: number) => void }) => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <label htmlFor={id} className="text-sm font-medium text-gray-300">{label}</label>
        <span className="text-brand-light font-bold font-mono">{prefix}{value?.toLocaleString()}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-bg-border rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{prefix}{min.toLocaleString()}</span>
        <span>{prefix}{max.toLocaleString()}</span>
      </div>
    </div>
  );

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl mb-4">🛡️</div>
          <h2 className="text-xl font-bold text-white mb-2">Enter Merchant ID</h2>
          <p className="text-gray-400">Set your Merchant ID in the sidebar first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">🛡️ Policy Editor</h1>
      <p className="text-gray-400 text-sm mb-6">Configure AI buyer rules. Changes take effect immediately for all future agent calls.</p>

      {/* Master Kill Switch */}
      <div className="card mb-6 glow-brand">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-white text-lg">AI Buyers</div>
            <div className="text-gray-400 text-sm mt-1">
              {aiEnabled
                ? 'AI agents can discover and purchase from your store'
                : '⛔ All AI agent access is paused'}
            </div>
          </div>
          <button
            id="toggle-ai-buyers"
            onClick={() => setAiEnabled(!aiEnabled)}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none ${
              aiEnabled ? 'bg-status-approved' : 'bg-status-blocked'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-300 ${
                aiEnabled ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Thresholds */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-5">Order Thresholds</h2>
        <SliderField
          id="slider-human-review"
          label="Human Review Threshold"
          value={policies.human_review_above ?? 2000}
          min={500}
          max={10000}
          onChange={(v) => setPolicies({ ...policies, human_review_above: v })}
        />
        <SliderField
          id="slider-max-order"
          label="Max Order Value"
          value={policies.max_order_value ?? 10000}
          min={500}
          max={50000}
          step={1000}
          onChange={(v) => setPolicies({ ...policies, max_order_value: v })}
        />
        <SliderField
          id="slider-gmv-cap"
          label="Daily AI GMV Cap"
          value={policies.daily_ai_gmv_cap ?? 50000}
          min={5000}
          max={500000}
          step={5000}
          onChange={(v) => setPolicies({ ...policies, daily_ai_gmv_cap: v })}
        />
        <SliderField
          id="slider-discount-cap"
          label="Discount Cap"
          value={policies.discount_cap_percent ?? 10}
          min={0}
          max={50}
          step={5}
          prefix="%"
          onChange={(v) => setPolicies({ ...policies, discount_cap_percent: v })}
        />
      </div>

      {/* Agent Types */}
      <div className="card mb-6">
        <h2 className="font-semibold text-white mb-3">Allowed Agent Types</h2>
        <div className="flex flex-wrap gap-2">
          {['shopping', 'travel', 'enterprise', 'personal', 'research'].map((type) => {
            const active = policies.allowed_agent_types?.includes(type) ?? false;
            return (
              <button
                key={type}
                id={`agent-type-${type}`}
                onClick={() => {
                  const current = policies.allowed_agent_types ?? [];
                  const updated = active
                    ? current.filter((t) => t !== type)
                    : [...current, type];
                  setPolicies({ ...policies, allowed_agent_types: updated });
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-brand/20 text-brand-light border border-brand/30'
                    : 'bg-bg-elevated text-gray-500 border border-bg-border hover:border-brand/30'
                }`}
              >
                {type}
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
          className="btn-primary px-8 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '⏳ Saving...' : '💾 Save Changes'}
        </button>
        {saved && (
          <span className="text-status-approved text-sm font-medium animate-fade-in">
            ✅ Policies updated — takes effect immediately
          </span>
        )}
      </div>
    </div>
  );
}
