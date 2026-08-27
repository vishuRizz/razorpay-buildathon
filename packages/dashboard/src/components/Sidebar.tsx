import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../App';

const NAV = [
  { path: '/live', icon: '⚡', label: 'Live Feed' },
  { path: '/policy', icon: '🛡️', label: 'Policy Editor' },
  { path: '/logs', icon: '📋', label: 'Audit Log' },
  { path: '/analytics', icon: '📊', label: 'Analytics' },
];

export default function Sidebar() {
  const { merchantId, setMerchantId, pendingCount } = useApp();
  const [inputId, setInputId] = useState(merchantId);

  return (
    <aside className="w-64 bg-bg-surface border-r border-bg-border flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center font-bold text-white text-sm">
            A
          </div>
          <div>
            <div className="font-bold text-white text-sm tracking-wide">AISLE</div>
            <div className="text-gray-500 text-xs">AI Commerce Protocol</div>
          </div>
        </div>
      </div>

      {/* Merchant ID input */}
      <div className="p-4 border-b border-bg-border">
        <label className="text-xs text-gray-500 font-medium block mb-1.5">MERCHANT ID</label>
        <div className="flex gap-2">
          <input
            id="merchant-id-input"
            className="input-field flex-1 text-xs font-mono"
            placeholder="store_..."
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setMerchantId(inputId)}
          />
          <button
            id="merchant-id-save"
            className="btn-primary text-xs px-3 py-2"
            onClick={() => setMerchantId(inputId)}
          >
            Set
          </button>
        </div>
        {merchantId && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-approved live-dot" />
            <span className="text-xs text-gray-500 font-mono truncate">{merchantId}</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-brand/10 text-brand-light border border-brand/20'
                  : 'text-gray-400 hover:text-white hover:bg-bg-elevated'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {item.label === 'Live Feed' && pendingCount > 0 && (
              <span className="ml-auto bg-status-pending text-bg-base text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-bg-border">
        <div className="text-xs text-gray-600">
          <div className="font-medium text-gray-500 mb-1">Razorpay AI Buildathon 2026</div>
          <div>Track 01 — AISLE v1.0</div>
        </div>
      </div>
    </aside>
  );
}
