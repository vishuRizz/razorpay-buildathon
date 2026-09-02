import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Zap, ShieldCheck, ScrollText, BarChart3,
  ChevronRight, Radio, Play, Brain, Home
} from 'lucide-react';
import { useApp } from '../App';

const NAV = [
  { path: '/brain',   icon: Brain,       label: 'Agent Brain',    shortLabel: 'BRAIN' },
  { path: '/live',     icon: Zap,         label: 'Live Feed',      shortLabel: 'LIVE' },
  { path: '/simulate', icon: Play,         label: 'Demo Runner',    shortLabel: 'DEMO' },
  { path: '/policy',  icon: ShieldCheck,  label: 'Policy Engine',  shortLabel: 'POLICY' },
  { path: '/logs',    icon: ScrollText,   label: 'Audit Log',      shortLabel: 'AUDIT' },
  { path: '/analytics', icon: BarChart3,  label: 'Analytics',      shortLabel: 'STATS' },
];

export default function Sidebar() {
  const { merchantId, setMerchantId, pendingCount } = useApp();
  const [inputId, setInputId] = useState(merchantId);

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col h-full shrink-0">
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <Link to="/" className="block group">
          <img
            src="/logo-withtext.png"
            alt="AISLE"
            className="h-8 object-contain group-hover:opacity-80 transition-opacity"
          />
        </Link>
        <p className="text-[10px] font-mono text-muted-foreground mt-1 tracking-wider">
          UAP · ACP · Track 01
        </p>
      </div>

      <div className="px-4 py-4 border-b border-border">
        <div className="text-[10px] font-mono text-muted-foreground tracking-widest mb-2">Merchant ID</div>
        <div className="flex gap-2">
          <input
            id="merchant-id-input"
            className="input-field flex-1 text-xs !py-2 !rounded-lg"
            placeholder="store_..."
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setMerchantId(inputId)}
          />
          <button
            id="merchant-id-save"
            className="btn-primary !px-3 !py-2 text-xs shrink-0 !rounded-lg"
            onClick={() => setMerchantId(inputId)}
          >
            Set
          </button>
        </div>
        {merchantId && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 live-dot shrink-0" />
            <span className="text-[10px] text-muted-foreground font-mono truncate">{merchantId}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        <div className="text-[9px] font-mono text-muted-foreground tracking-widest px-2 pt-1 pb-2">Modules</div>
        <NavLink
          to="/"
          end
          id="nav-home"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
              isActive
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Home size={15} strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="flex-1">Landing</span>
              {isActive && <ChevronRight size={12} className="opacity-60 shrink-0" />}
            </>
          )}
        </NavLink>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              id={`nav-${item.shortLabel.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
                  isActive
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} strokeWidth={isActive ? 2.5 : 1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Live Feed' && pendingCount > 0 && (
                    <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                  {isActive && <ChevronRight size={12} className="opacity-60 shrink-0" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-border space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-muted-foreground tracking-widest">Status</span>
          <div className="flex items-center gap-1">
            <Radio size={9} className="text-green-600" />
            <span className="text-[9px] text-green-600 font-medium">Online</span>
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground/70 leading-relaxed font-mono">
          Razorpay AI Buildathon 2026
        </div>
      </div>
    </aside>
  );
}
