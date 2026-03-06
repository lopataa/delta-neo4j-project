import { AppShell } from '@/components/app-shell';
import { safeFetchJson } from '@/lib/api';
import type { HealthResponse, Order, Product } from '@/lib/types';

type ApiHealth = {
  status: string;
  service: string;
  timestamp: string;
};

const emptyHealth: HealthResponse = {
  kpis: {
    onTimeRate: 0,
    delayedRate: 0,
    avgOrderCost: 0,
    totalOrders: 0,
  },
  criticalComponents: [],
  bottlenecks: [],
  highRiskSuppliers: [],
  recommendations: [],
};

export default async function DashboardPage() {
  const [apiHealth, health, products, orders] = await Promise.all([
    safeFetchJson<ApiHealth>('/health', {
      status: 'offline',
      service: 'Blue Shark Logistics API',
      timestamp: '',
    }),
    safeFetchJson<HealthResponse>('/analytics/supply-chain-health', emptyHealth),
    safeFetchJson<Product[]>('/products', []),
    safeFetchJson<Order[]>('/orders', []),
  ]);

  return (
    <AppShell
      title="Blue Shark Logistics Control Deck 🦈✨"
      subtitle="Cute exterior, serious graph analytics under the hood."
    >
      <section className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">API Status</p>
          <p className="kpi-value">{apiHealth.status}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Products</p>
          <p className="kpi-value">{products.length}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Orders</p>
          <p className="kpi-value">{orders.length}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">On-Time Rate</p>
          <p className="kpi-value">{Math.round(health.kpis.onTimeRate * 100)}%</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Delay Rate</p>
          <p className="kpi-value">{Math.round(health.kpis.delayedRate * 100)}%</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Avg Order Cost</p>
          <p className="kpi-value">${Math.round(health.kpis.avgOrderCost)}</p>
        </article>
      </section>

      <section className="card">
        <h3>Top Recommendations</h3>
        <ul className="list">
          {health.recommendations.slice(0, 4).map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
          {health.recommendations.length === 0 && (
            <li>No recommendations yet. Seed data may still be loading.</li>
          )}
        </ul>
      </section>
    </AppShell>
  );
}
