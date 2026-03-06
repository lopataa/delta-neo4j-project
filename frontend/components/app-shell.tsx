import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  { href: '/', label: 'Dashboard 🦈' },
  { href: '/products', label: 'Products' },
  { href: '/components/manage', label: 'Components' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/orders', label: 'Orders' },
  { href: '/analytics/health', label: 'Health' },
  { href: '/analytics/scenarios', label: 'Scenarios ✨' },
];

type AppShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AppShell({ title, subtitle, children }: AppShellProps) {
  return (
    <div className="shell">
      <div className="frame">
        <header className="topbar">
          <div>
            <p className="brand-kicker">Blue Shark Logistics</p>
            <h1 className="brand-title">{title}</h1>
            <p className="brand-subtitle">{subtitle}</p>
          </div>
        </header>

        <nav className="nav-row">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link">
              {link.label}
            </Link>
          ))}
        </nav>

        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}
