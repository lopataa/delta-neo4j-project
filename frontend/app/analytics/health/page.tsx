import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { safeFetchJson } from '@/lib/api';
import type { HealthResponse } from '@/lib/types';

type DelayForecast = {
  months: number;
  projection: Array<{
    month: string;
    projectedDelayRate: number;
    estimatedDelayedOrders: number;
  }>;
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

function maxFrom(values: number[]): number {
  const max = Math.max(...values, 0);
  return max <= 0 ? 1 : max;
}

export default async function AnalyticsHealthPage() {
  const [health, delayForecast] = await Promise.all([
    safeFetchJson<HealthResponse>('/analytics/supply-chain-health', emptyHealth),
    safeFetchJson<DelayForecast>('/analytics/forecast-delays?months=6', {
      months: 6,
      projection: [],
    }),
  ]);

  const maxDelayRate = maxFrom(delayForecast.projection.map((item) => item.projectedDelayRate));

  return (
    <AppShell
      title="Supply Chain Health"
      subtitle="KPI dashboard for bottlenecks, critical components, supplier risk, and delay outlook."
    >
      <section className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">On-Time</p>
          <p className="kpi-value">{(health.kpis.onTimeRate * 100).toFixed(1)}%</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Delayed</p>
          <p className="kpi-value">{(health.kpis.delayedRate * 100).toFixed(1)}%</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Avg Cost</p>
          <p className="kpi-value">${health.kpis.avgOrderCost.toFixed(0)}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Orders</p>
          <p className="kpi-value">{health.kpis.totalOrders}</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>Critical Components</h3>
          <ul className="list">
            {health.criticalComponents.map((item) => (
              <li key={item.component.id}>
                <strong>{item.component.name}</strong> · suppliers {item.supplierCount} ·
                {' '}
                <span className={`tag status-${item.riskLevel}`}>{item.riskLevel}</span>
              </li>
            ))}
            {health.criticalComponents.length === 0 && <li>No critical components found.</li>}
          </ul>
        </article>

        <article className="card">
          <h3>Bottlenecks</h3>
          <ul className="list">
            {health.bottlenecks.map((item) => (
              <li key={item.location.id}>
                <strong>{item.location.name}</strong> · connections {item.connectionCount} ·
                {' '}
                <span className={`tag status-${item.pressure}`}>{item.pressure}</span>
              </li>
            ))}
            {health.bottlenecks.length === 0 && <li>No bottlenecks returned.</li>}
          </ul>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>High-Risk Suppliers</h3>
          <ul className="list">
            {health.highRiskSuppliers.map((item) => (
              <li key={item.company.id}>
                <Link href={`/suppliers/${item.company.id}`}>
                  <strong>{item.company.name}</strong>
                </Link>
                {' · '}reliability {item.company.reliability}
                {' · '}risk {item.risk}
              </li>
            ))}
            {health.highRiskSuppliers.length === 0 && <li>No high-risk suppliers in data.</li>}
          </ul>
        </article>

        <article className="card">
          <h3>Forecast Delays (6 months)</h3>
          <div className="chart-row">
            {delayForecast.projection.map((point) => {
              const width = `${Math.max(5, (point.projectedDelayRate / maxDelayRate) * 100)}%`;
              return (
                <div className="chart-line" key={point.month}>
                  <div className="chart-label">
                    <span>{point.month}</span>
                    <span>{(point.projectedDelayRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="chart-track">
                    <div className="chart-fill" style={{ width }} />
                  </div>
                </div>
              );
            })}
            {delayForecast.projection.length === 0 && <p>No forecast data.</p>}
          </div>
        </article>
      </section>

      <section className="card">
        <h3>Recommendations ✨</h3>
        <ul className="list">
          {health.recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {health.recommendations.length === 0 && <li>No recommendations.</li>}
        </ul>
      </section>
    </AppShell>
  );
}
