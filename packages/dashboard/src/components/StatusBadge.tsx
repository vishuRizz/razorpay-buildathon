import React from 'react';
import { CheckCircle2, Clock, XCircle, ShoppingCart, Search, FileText, Repeat, Info, ThumbsUp, ThumbsDown } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
}

const CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  CHECKOUT_SUCCESS:        { label: 'APPROVED',       className: 'badge-approved', icon: <CheckCircle2 size={9} /> },
  HUMAN_REVIEW_APPROVED:  { label: 'APPROVED',       className: 'badge-approved', icon: <ThumbsUp size={9} /> },
  HUMAN_REVIEW_REQUESTED: { label: 'REVIEW',         className: 'badge-pending',  icon: <Clock size={9} /> },
  POLICY_BLOCK:            { label: 'BLOCKED',        className: 'badge-blocked',  icon: <XCircle size={9} /> },
  CHECKOUT_FAILED:         { label: 'FAILED',         className: 'badge-blocked',  icon: <XCircle size={9} /> },
  HUMAN_REVIEW_REJECTED:  { label: 'REJECTED',       className: 'badge-blocked',  icon: <ThumbsDown size={9} /> },
  ADD_TO_CART:             { label: 'CART',           className: 'badge-info',     icon: <ShoppingCart size={9} /> },
  DISCOVER:                { label: 'DISCOVER',       className: 'badge-neutral',  icon: <Search size={9} /> },
  CATALOG_QUERY:           { label: 'CATALOG',        className: 'badge-neutral',  icon: <FileText size={9} /> },
  MANIFEST_READ:           { label: 'MANIFEST',       className: 'badge-neutral',  icon: <Info size={9} /> },
  ORDER_STATUS:            { label: 'POLL',           className: 'badge-neutral',  icon: <Repeat size={9} /> },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = CONFIG[status] ?? { label: status.replace(/_/g, ' '), className: 'badge-neutral', icon: <Info size={9} /> };
  return (
    <span className={`badge ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
