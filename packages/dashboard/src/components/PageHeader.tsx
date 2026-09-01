import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, eyebrow, icon, badge, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
            <span className="w-8 h-px bg-foreground/30" />
            {eyebrow}
          </span>
        )}
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {icon}
          <div>
            <h1 className="text-2xl lg:text-3xl font-display tracking-tight text-foreground leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">{subtitle}</p>
            )}
          </div>
          {badge}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
