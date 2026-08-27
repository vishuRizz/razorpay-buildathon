import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Area, AreaChart,
} from 'recharts';
import { useApp } from '../App';
import { TrendingUp, Zap, CheckCircle2, ShieldOff, BarChart3 } from 'lucide-react';

interface KPI {
  label: string;
  value: string;
  sub: string;
  color: string;
  icon: React.ReactNode;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#141414',
  border: '1px solid #2A2A2A',
  borderRadius: '6px',
  fontFamily: 'Roboto Mono, monospace',
  fontSize: '11px',
  color: '#BDBDBD',
};

export default function Analytics() {
  const { merchantId } = useApp();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!merchantId) return;
    setLoading(true);
    axios.get(`/v1/merchants/${merchantId}/analytics`)
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, [merchantId]);

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full neural-bg grid-mesh">
        <div className="text-center animate-fade-up">
          <div className="w-14 h-14 mx-auto mb-4 border border-green-primary/20 rounded flex items-center justify-center bg-green-primary/5 glow-green">
            <BarChart3 size={22} className="text-green-primary" />
          </div>
          <h2 className="text-sm font-bold text-white tracking-widest mb-2">ANALYTICS_ENGINE</h2>
          <p className="text-xs text-gray-mid font-mono">Set your Merchant ID in the sidebar to load metrics.</p>
        </div>
      </div>
    );
  }

  const gmv7d = (data?.gmv_7d as { date: string; gmv: string }[]) ?? [];
  const topProducts = (data?.top_products as { sku?: string; name?: string; count: string; revenue: string }[]) ?? [];
  const policyDist = (data?.policy_outcome_distribution as { approved: string; count: string }[]) ?? [];
  const gmv30dTotal = (data?.gmv_30d_total as number) ?? 0;
  const activity = (data?.activity_by_action as { action: string; count: string }[]) ?? [];

  const pieData = policyDist.map((p) => ({
    name: p.approved === 'true' ? 'APPROVED' : 'BLOCKED',
    value: parseInt(p.count, 10),
  }));

  const kpis: KPI[] = [
    {
      label: 'AI_GMV_30D',
      value: `₹${gmv30dTotal.toLocaleString()}`,
      sub: 'Last 30 days',
      color: 'text-green-primary',
      icon: <TrendingUp size={14} className="text-green-primary" />,
    },
    {
      label: 'TOTAL_EVENTS',
      value: String(activity.reduce((s, a) => s + parseInt(a.count, 10), 0)),
      sub: 'All time',
      color: 'text-white',
      icon: <Zap size={14} className="text-blue-electric" />,
    },
    {
      label: 'CHECKOUTS',
      value: String(activity.find((a) => a.action === 'CHECKOUT_SUCCESS')?.count ?? 0),
      sub: 'Completed orders',
      color: 'text-status-approved',
      icon: <CheckCircle2 size={14} className="text-status-approved" />,
    },
    {
      label: 'POLICY_BLOCKS',
      value: String(activity.find((a) => a.action === 'POLICY_BLOCK')?.count ?? 0),
      sub: 'Blocked by engine',
      color: 'text-status-blocked',
      icon: <ShieldOff size={14} className="text-status-blocked" />,
    },
  ];

  return (
    <div className="p-6 space-y-5 animate-fade-up bg-bg-base neural-bg min-h-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 size={16} className="text-green-primary" />
        <h1 className="text-sm font-bold text-white tracking-widest">ANALYTICS_ENGINE</h1>
        {loading && <span className="text-[9px] text-gray-mid tracking-widest animate-pulse ml-2">LOADING...</span>}
      </div>

      {/* Ticker */}
      {activity.length > 0 && (
        <div className="overflow-hidden border border-bg-border rounded bg-bg-surface py-1.5 relative">
          <div className="ticker-inner">
            {[...activity, ...activity].map((a, i) => (
              <span key={i} className="text-[10px] font-mono text-gray-mid px-6 whitespace-nowrap">
                <span className="text-green-primary">{a.action}</span>
                <span className="text-gray-mid/40 mx-2">·</span>
                {a.count} events
              </span>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="card border-glow relative overflow-hidden"
            id={`kpi-${kpi.label.toLowerCase()}`}
          >
            {/* Subtle corner accent */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-green-primary/3 rounded-bl-full" />
            <div className="flex items-start justify-between mb-2">
              <div className="text-[9px] text-gray-mid tracking-widest">{kpi.label}</div>
              {kpi.icon}
            </div>
            <div className={`text-2xl font-bold font-mono ${kpi.color} leading-none mb-1`}>{kpi.value}</div>
            <div className="text-[10px] text-gray-mid">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-3">
        {/* GMV Area Chart */}
        <div className="card col-span-2 border-glow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-medium text-gray-cold tracking-widest">AI_DRIVEN_GMV · 7D</h2>
            <span className="badge badge-info">LINE_CHART</span>
          </div>
          {gmv7d.length === 0 ? (
            <div className="flex items-center justify-center h-36 text-gray-mid/40 text-xs font-mono">NO_DATA_YET</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={gmv7d.map((d) => ({ ...d, gmv: parseInt(d.gmv, 10) }))}>
                <defs>
                  <linearGradient id="gmvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#76B900" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#76B900" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                <XAxis dataKey="date" tick={{ fill: '#4A4A4A', fontSize: 9, fontFamily: 'Roboto Mono' }} />
                <YAxis tick={{ fill: '#4A4A4A', fontSize: 9, fontFamily: 'Roboto Mono' }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`₹${v.toLocaleString()}`, 'GMV']} />
                <Area type="monotone" dataKey="gmv" stroke="#76B900" strokeWidth={2} fill="url(#gmvGradient)" dot={{ fill: '#76B900', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Policy Pie */}
        <div className="card border-glow">
          <h2 className="text-[10px] font-medium text-gray-cold tracking-widest mb-4">POLICY_OUTCOMES</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-36 text-gray-mid/40 text-xs font-mono">NO_DATA_YET</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={4}
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#6EFA5F' : '#FF3B3B'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 9, fontFamily: 'Roboto Mono', color: '#4A4A4A' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Activity Bar Chart */}
        <div className="card border-glow">
          <h2 className="text-[10px] font-medium text-gray-cold tracking-widest mb-4">ACTIVITY_BY_ACTION</h2>
          {activity.length === 0 ? (
            <div className="flex items-center justify-center h-36 text-gray-mid/40 text-xs font-mono">NO_DATA_YET</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activity.slice(0, 8).map((a) => ({ ...a, count: parseInt(a.count, 10) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                <XAxis dataKey="action" tick={{ fill: '#4A4A4A', fontSize: 8, fontFamily: 'Roboto Mono' }} angle={-20} textAnchor="end" height={44} />
                <YAxis tick={{ fill: '#4A4A4A', fontSize: 9, fontFamily: 'Roboto Mono' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#76B900" radius={[3, 3, 0, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Products */}
        <div className="card border-glow">
          <h2 className="text-[10px] font-medium text-gray-cold tracking-widest mb-4">TOP_PRODUCTS_AI</h2>
          {topProducts.length === 0 ? (
            <div className="flex items-center justify-center h-36 text-gray-mid/40 text-xs font-mono">NO_COMPLETED_ORDERS</div>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 6).map((p, i) => {
                const pct = Math.min(100, (parseInt(p.count, 10) / parseInt(topProducts[0].count, 10)) * 100);
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="text-[10px] text-gray-mid/50 font-mono w-3 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-cold font-mono truncate mb-1">{p.name ?? p.sku}</div>
                      <div className="h-1 bg-bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-primary rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-green-primary font-mono">₹{parseInt(p.revenue, 10).toLocaleString()}</div>
                      <div className="text-[9px] text-gray-mid">{p.count} orders</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
