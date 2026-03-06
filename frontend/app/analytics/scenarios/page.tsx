import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { safeFetchJson } from '@/lib/api';
import type { Company } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ImpactResponse = {
  supplierId: string;
  supplierName: string;
  scenarioName: string;
  impact: {
    affectedProducts: Array<{
      productId: string;
      productName: string;
      affectedOrders: number;
      delayDays: number;
      alternativeSupplyTime: number;
    }>;
    estimatedCost: number;
    affectedRevenue: number;
    timeline: string;
    mitigation: string[];
  };
};

type RiskResponse = {
  supplierId: string;
  riskScore: number;
  factors: {
    reliabilityScore: number;
    onTimeDeliveryRate: number;
    geopoliticalRisk: number;
  };
  recommendations: string[];
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function ScenariosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const companies = await safeFetchJson<Company[]>('/companies', []);
  const supplierCandidates = companies.filter((company) =>
    ['supplier', 'manufacturer'].includes(company.type),
  );

  const selectedSupplierId =
    first(params.supplier) || supplierCandidates[0]?.id || companies[0]?.id || '';

  const [impact, risk] = await Promise.all([
    selectedSupplierId
      ? safeFetchJson<ImpactResponse | null>(
          `/analytics/impact-analysis?supplier=${encodeURIComponent(selectedSupplierId)}`,
          null,
        )
      : Promise.resolve(null),
    selectedSupplierId
      ? safeFetchJson<RiskResponse | null>(
          `/companies/${encodeURIComponent(selectedSupplierId)}/risk-assessment`,
          null,
        )
      : Promise.resolve(null),
  ]);

  return (
    <AppShell
      title="Risk & Scenario Simulator"
      subtitle="Select a supplier and simulate outage impact on products, orders, and costs."
    >
      <form className="filters" method="get">
        <div className="filters-field">
          <label htmlFor="scenarios-supplier">Supplier</label>
          <select id="scenarios-supplier" name="supplier" defaultValue={selectedSupplierId}>
            {supplierCandidates.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Run Scenario 🦈</button>
      </form>

      <section className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">Supplier</p>
          <p className="kpi-value">
            {impact ? (
              <Link href={`/suppliers/${impact.supplierId}`}>{impact.supplierName}</Link>
            ) : (
              'n/a'
            )}
          </p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Scenario</p>
          <p className="kpi-value">{impact?.scenarioName ?? 'n/a'}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Risk Score</p>
          <p className="kpi-value">{risk?.riskScore.toFixed(2) ?? 'n/a'}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Estimated Cost Impact</p>
          <p className="kpi-value">${impact?.impact.estimatedCost ?? 0}</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>Affected Products</h3>
          <ul className="list">
            {(impact?.impact.affectedProducts ?? []).map((product) => (
              <li key={product.productId}>
                <Link href={`/products/${product.productId}`}>
                  <strong>{product.productName}</strong>
                </Link>
                {' · '}orders {product.affectedOrders}
                {' · '}delay {product.delayDays}d · alternative lead {product.alternativeSupplyTime}d
              </li>
            ))}
            {(impact?.impact.affectedProducts ?? []).length === 0 && (
              <li>No affected products returned for this supplier.</li>
            )}
          </ul>
        </article>

        <article className="card">
          <h3>Mitigation Plan</h3>
          <ul className="list">
            {(impact?.impact.mitigation ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
            {(impact?.impact.mitigation ?? []).length === 0 && (
              <li>No mitigation output from API.</li>
            )}
          </ul>
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>Risk Factors</h3>
          <ul className="list">
            <li>Reliability: {risk?.factors.reliabilityScore.toFixed(2) ?? 'n/a'}</li>
            <li>On-time rate: {risk ? `${(risk.factors.onTimeDeliveryRate * 100).toFixed(1)}%` : 'n/a'}</li>
            <li>Geopolitical risk: {risk?.factors.geopoliticalRisk.toFixed(2) ?? 'n/a'}</li>
            <li>Timeline: {impact?.impact.timeline ?? 'n/a'}</li>
            <li>Affected revenue: ${impact?.impact.affectedRevenue ?? 0}</li>
          </ul>
        </article>

        <article className="card">
          <h3>Recommended Actions ✨</h3>
          <ul className="list">
            {(risk?.recommendations ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
            {(risk?.recommendations ?? []).length === 0 && <li>No recommendations yet.</li>}
          </ul>
        </article>
      </section>
    </AppShell>
  );
}
