import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = status?.toUpperCase();

  if (s === 'APPROVED' || s === 'PAID' || s === 'CREATED' || s === 'CHECKOUT_SUCCESS') {
    return <span className="badge-approved">{s === 'CHECKOUT_SUCCESS' ? 'APPROVED' : s}</span>;
  }
  if (s === 'PENDING_REVIEW' || s === 'HUMAN_REVIEW_REQUESTED') {
    return <span className="badge-pending">PENDING REVIEW</span>;
  }
  if (s === 'POLICY_BLOCK' || s === 'BLOCKED' || s === 'FAILED' || s === 'CANCELLED' || s === 'CHECKOUT_FAILED') {
    return <span className="badge-blocked">{s === 'POLICY_BLOCK' ? 'BLOCKED' : s}</span>;
  }
  return (
    <span className="bg-gray-700/50 text-gray-400 border border-gray-600/30 text-xs font-medium px-2 py-0.5 rounded-full">
      {s}
    </span>
  );
}
