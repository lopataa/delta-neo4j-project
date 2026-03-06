'use client';

import { useState, type ReactNode } from 'react';

type ExpandableCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
};

export function ExpandableCard({
  title,
  children,
  className = '',
  defaultExpanded = false,
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className={`card expandable-card ${expanded ? 'is-expanded' : ''} ${className}`.trim()}>
      <div className="expandable-head">
        <h3>{title}</h3>
        <button
          type="button"
          className="button-muted expandable-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <div className="expandable-body">{children}</div>
    </section>
  );
}
