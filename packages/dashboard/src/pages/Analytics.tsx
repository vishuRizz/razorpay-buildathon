import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useApp } from '../App';


interface KPI {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
}

export default function Analytics() {
  const { merchantId } = useApp();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!merchantId) return;
    axios.get(`/v1/merchants/${merchantId}/analytics`)
      .then(({ data }) => setData(data));
  }, [merchantId]);

  if (!merchantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-bold text-white mb-2">Enter Merchant ID</h2>
          <p className="text-gray-400">Set your Merchant ID in the sidebar first.</p>
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
    name: p.approved === 'true' ? 'Approved' : 'Blocked',
    value: parseInt(p.count, 10),
  }));

  const kpis: KPI[] = [
    {
      label: '30-Day AI GMV',
      value: `₹${gmv30dTotal.toLocaleString()}`,
      sub: 'Last 30 days',
      color: 'text-brand-light',
      icon: '💰',
    },
    {
      label: 'Total Events',
      value: String(activity.reduce((s, a) => s + parseInt(a.count, 10), 0)),
      sub: 'All time',
      color: 'text-gray-200',
      icon: '⚡',
    },
    {
      label: 'Successful Checkouts',
      value: String(activity.find((a) => a.action === 'CHECKOUT_SUCCESS')?.count ?? 0),
      sub: 'Completed orders',
      color: 'text-status-approved',
      icon: '✅',
    },
    {
      label: 'Policy Blocks',
      value: String(activity.find((a) => a.action === 'POLICY_BLOCK')?.count ?? 0),
      sub: 'Blocked by policy',
      color: 'text-status-blocked',
      icon: '🚫',
    },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">📊 Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">AI-driven commerce metrics for your store</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} id={`kpi-${kpi.label.toLowerCase().replace(/[^a-z]/g, '-')}`} className="card glow-brand">
            <div className="text-2xl mb-2">{kpi.icon}</div>
            <div className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-sm text-white font-medium mt-1">{kpi.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-3 gap-4">
        {/* GMV over 7 days */}
        <div className="card col-span-2">
          <h2 className="font-semibold text-white mb-4">AI-Driven GMV (Last 7 Days)</h2>
          {gmv7d.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-600">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={gmv7d.map((d) => ({ ...d, gmv: parseInt(d.gmv, 10) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2d3d" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2d3d', borderRadius: 8 }}
                  labelStyle={{ color: '#f9fafb' }}
                  formatter={(v: number) => [`₹${v.toLocaleString()}`, 'GMV']}
                />
                <Line type="monotone" dataKey="gmv" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Policy outcome pie */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Policy Outcomes</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-600">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2d3d', borderRadius: 8 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Activity by action */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Activity by Action</h2>
          {activity.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-600">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activity.slice(0, 8).map((a) => ({ ...a, count: parseInt(a.count, 10) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2d3d" />
                <XAxis dataKey="action" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2d3d', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top products */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Top Products by AI Purchase</h2>
          {topProducts.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-600">No completed orders yet</div>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 6).map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-gray-600 text-sm w-4 font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{p.name ?? p.sku}</div>
                    <div className="text-xs text-gray-500">{p.count} orders · ₹{parseInt(p.revenue, 10).toLocaleString()} revenue</div>
                  </div>
                  <div className="w-20 bg-bg-border rounded-full h-1.5">
                    <div
                      className="bg-brand rounded-full h-1.5"
                      style={{ width: `${Math.min(100, (parseInt(p.count, 10) / (parseInt(topProducts[0].count, 10))) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
