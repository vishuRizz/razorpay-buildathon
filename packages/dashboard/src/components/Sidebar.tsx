import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Zap, ShieldCheck, ScrollText, BarChart3,
  ChevronRight, Radio, Cpu
} from 'lucide-react';
import { useApp } from '../App';

const NAV = [
  { path: '/live',     icon: Zap,         label: 'Live Feed',      shortLabel: 'LIVE' },
  { path: '/policy',  icon: ShieldCheck,  label: 'Policy Engine',  shortLabel: 'POLICY' },
  { path: '/logs',    icon: ScrollText,   label: 'Audit Log',      shortLabel: 'AUDIT' },
  { path: '/analytics', icon: BarChart3,  label: 'Analytics',      shortLabel: 'STATS' },
];

export default function Sidebar() {
  const { merchantId, setMerchantId, pendingCount } = useApp();
  const [inputId, setInputId] = useState(merchantId);

  return (
    <aside className="w-56 bg-bg-surface border-r border-bg-border flex flex-col h-full shrink-0 relative overflow-hidden">
      {/* Subtle green glow top-left */}
      <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full bg-green-primary/5 blur-2xl pointer-events-none" />

      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-bg-border">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 shrink-0">
            <div className="w-8 h-8 bg-green-primary rounded flex items-center justify-center">
              <Cpu size={16} className="text-bg-base" strokeWidth={2.5} />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-circuit live-dot border border-bg-surface" />
          </div>
          <div>
            <div className="font-bold text-white text-sm tracking-widest leading-none">AISLE</div>
            <div className="text-[10px] text-gray-mid mt-0.5 tracking-wider">AI_COMMERCE_PROTOCOL</div>
          </div>
        </div>
      </div>

      {/* Merchant ID */}
      <div className="px-3 py-3 border-b border-bg-border">
        <div className="text-[10px] text-gray-mid font-medium tracking-widest mb-1.5">MERCHANT_ID</div>
        <div className="flex gap-1.5">
          <input
            id="merchant-id-input"
            className="input-field flex-1 text-xs"
            placeholder="store_..."
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setMerchantId(inputId)}
          />
          <button
            id="merchant-id-save"
            className="btn-primary px-2 py-1.5 text-xs shrink-0"
            onClick={() => setMerchantId(inputId)}
          >
            SET
          </button>
        </div>
        {merchantId && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-circuit live-dot shrink-0" />
            <span className="text-[10px] text-gray-mid font-mono truncate">{merchantId}</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5">
        <div className="text-[9px] text-gray-mid tracking-widest px-2 pt-2 pb-1">MODULES</div>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              id={`nav-${item.shortLabel.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2 py-2 rounded text-xs font-medium tracking-wide transition-all duration-200 group ${
                  isActive
                    ? 'bg-green-primary/10 text-green-primary border border-green-primary/20'
                    : 'text-gray-mid hover:text-white hover:bg-bg-elevated'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={14}
                    strokeWidth={isActive ? 2.5 : 1.75}
                    className={isActive ? 'text-green-primary' : 'text-gray-mid group-hover:text-white'}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Live Feed' && pendingCount > 0 && (
                    <span className="bg-status-pending text-bg-base text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                      {pendingCount}
                    </span>
                  )}
                  {isActive && <ChevronRight size={10} className="text-green-primary/50 shrink-0" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* System status */}
      <div className="px-3 py-3 border-t border-bg-border space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-gray-mid tracking-widest">SYSTEM_STATUS</span>
          <div className="flex items-center gap-1">
            <Radio size={9} className="text-green-circuit" />
            <span className="text-[9px] text-green-circuit font-medium">ONLINE</span>
          </div>
        </div>
        <div className="text-[9px] text-gray-mid/60 leading-relaxed">
          Razorpay AI Buildathon 2026<br />
          Track 01 · v1.0.0
        </div>
      </div>
    </aside>
  );
}
