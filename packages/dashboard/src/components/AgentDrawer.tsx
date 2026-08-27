import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, ShieldCheck, AlertTriangle, User, History } from 'lucide-react';

interface AgentProfile {
  id: string;
  owner_email: string;
  reputation_score: number;
  daily_spend_inr: number;
  revoked: boolean;
  constraints: {
    spending_limit_per_session_inr: number;
    spending_limit_per_day_inr: number;
    allowed_categories: string[];
  };
  ledger: Array<{
    id: string;
    action: string;
    output: any;
    timestamp: string;
  }>;
}

export default function AgentDrawer({ agentId, onClose }: { agentId: string | null; onClose: () => void }) {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    axios.get(`/v1/agents/${agentId}`)
      .then(res => setProfile(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentId]);

  if (!agentId) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-[2px]" 
        onClick={onClose} 
      />
      <div className={`fixed top-0 right-0 h-full w-96 bg-bg-base border-l border-bg-border z-50 transform transition-transform duration-300 shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-bg-border bg-bg-surface/50">
          <div className="flex items-center gap-2">
            <User size={16} className="text-blue-electric" />
            <h2 className="text-xs font-bold text-white tracking-widest">AGENT_PROFILE</h2>
          </div>
          <button onClick={onClose} className="text-gray-mid hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-xs font-mono text-gray-mid">LOADING_PROFILE...</div>
          </div>
        ) : profile ? (
          <div className="flex-1 overflow-y-auto p-6 font-mono text-xs">
            {/* Identity */}
            <div className="mb-6">
              <div className="text-[10px] text-gray-mid mb-1 tracking-widest">IDENTITY</div>
              <div className="text-blue-electric font-bold text-sm mb-1">{profile.id}</div>
              <div className="text-gray-cold">Owner: {profile.owner_email}</div>
            </div>

            {/* Reputation */}
            <div className="mb-6 p-4 rounded border bg-bg-surface border-bg-border">
              <div className="flex justify-between items-center mb-2">
                <div className="text-[10px] text-gray-mid tracking-widest">REPUTATION_SCORE</div>
                <div className={`font-bold ${profile.reputation_score >= 80 ? 'text-green-primary' : profile.reputation_score >= 40 ? 'text-yellow-500' : 'text-status-blocked'}`}>
                  {profile.reputation_score} / 100
                </div>
              </div>
              <div className="h-1.5 w-full bg-black rounded-full overflow-hidden">
                <div 
                  className={`h-full ${profile.reputation_score >= 80 ? 'bg-green-primary glow-green' : profile.reputation_score >= 40 ? 'bg-yellow-500' : 'bg-status-blocked glow-red'}`} 
                  style={{ width: `${profile.reputation_score}%` }}
                />
              </div>
              {profile.reputation_score < 30 && (
                <div className="mt-3 text-[10px] text-status-blocked flex items-center gap-1">
                  <AlertTriangle size={10} /> Auto-blocked by Policy Engine
                </div>
              )}
            </div>

            {/* Constraints */}
            <div className="mb-6">
              <div className="text-[10px] text-gray-mid mb-2 tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} className="text-green-primary" /> CONSTRAINTS
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-mid">Session Limit:</span>
                  <span className="text-gray-cold">₹{profile.constraints.spending_limit_per_session_inr?.toLocaleString() ?? 'Unbounded'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-mid">Daily Spend:</span>
                  <span className="text-gray-cold">₹{profile.daily_spend_inr.toLocaleString()} / ₹{profile.constraints.spending_limit_per_day_inr?.toLocaleString()}</span>
                </div>
                <div className="flex flex-col gap-1 mt-2">
                  <span className="text-gray-mid">Allowed Categories:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {profile.constraints.allowed_categories?.map(c => (
                      <span key={c} className="bg-green-primary/10 text-green-primary px-1.5 py-0.5 rounded text-[9px] border border-green-primary/20">
                        {c.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Ledger */}
            <div>
              <div className="text-[10px] text-gray-mid mb-3 tracking-widest flex items-center gap-1">
                <History size={12} className="text-blue-electric" /> RECENT_ACTIVITY
              </div>
              <div className="space-y-3">
                {profile.ledger.length === 0 ? (
                  <div className="text-gray-mid italic">No recent activity on this store.</div>
                ) : (
                  profile.ledger.map(entry => (
                    <div key={entry.id} className="border-l-2 border-bg-border pl-3 py-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          entry.action === 'CHECKOUT_SUCCESS' ? 'bg-status-approved shadow-[0_0_5px_#76B900]' :
                          entry.action === 'POLICY_BLOCK' ? 'bg-status-blocked shadow-[0_0_5px_#FF3B3B]' : 'bg-status-pending shadow-[0_0_5px_#F59E0B]'
                        }`} />
                        <span className="text-[10px] text-gray-cold">{entry.action}</span>
                      </div>
                      <div className="text-[10px] text-gray-mid truncate">
                        {entry.action === 'POLICY_BLOCK' ? entry.output?.reason :
                         entry.action === 'CHECKOUT_SUCCESS' ? `${entry.output?.product} (₹${entry.output?.amount_inr})` : 
                         'Human review requested'}
                      </div>
                      <div className="text-[9px] text-gray-mid/50 mt-1">
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div className="text-status-blocked text-xs font-mono">Failed to load agent profile.</div>
          </div>
        )}
      </div>
    </>
  );
}
