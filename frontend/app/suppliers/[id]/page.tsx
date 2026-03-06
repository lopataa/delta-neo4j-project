import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { safeFetchJson } from '@/lib/api';
import type { Company } from '@/lib/types';

type Params = Promise<{ id: string }>;

type RiskAssessment = {
  supplierId: string;
  company: string;
  riskScore: number;
  factors: {
    reliabilityScore: number;
    onTimeDeliveryRate: number;
    qualityIssues: number;
    geopoliticalRisk: number;
    financialStability: number;
  };
  criticalFor: Array<{
    product: string;
    component: string;
    impact: string;
    alternatives: number;
  }>;
  recommendations: string[];
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  const companies = await safeFetchJson<Company[]>('/companies', []);
  const company = companies.find((entry) => entry.id === id) ?? null;

  const risk = company
    ? await safeFetchJson<RiskAssessment | null>(
        `/companies/${encodeURIComponent(id)}/risk-assessment`,
        null,
      )
    : null;

  return (
    <AppShell
      title={`Company Detail: ${company?.name ?? id}`}
      subtitle="Supplier/company profile, risk factors, and recommended mitigations."
    >
      {!company && (
        <section className="card">
          <h3>Company not found</h3>
          <p>The selected supplier/company does not exist.</p>
          <Link href="/suppliers" className="pill">
            Back To Suppliers
          </Link>
        </section>
      )}

      {company && (
        <>
          <section className="kpi-grid">
            <article className="kpi-card">
              <p className="kpi-label">Type</p>
              <p className="kpi-value">{company.type}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Country</p>
              <p className="kpi-value">{company.country}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Reliability</p>
              <p className="kpi-value">{company.reliability.toFixed(2)}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Risk Score</p>
              <p className="kpi-value">{risk?.riskScore.toFixed(2) ?? 'n/a'}</p>
            </article>
          </section>

          <section className="grid-2">
            <article className="card">
              <h3>Profile</h3>
              <ul className="list">
                <li>
                  <strong>ID:</strong> <span className="mono">{company.id}</span>
                </li>
                <li>
                  <strong>Coordinates:</strong> <span className="mono">{company.coordinates}</span>
                </li>
                <li>
                  <strong>On-time delivery:</strong>{' '}
                  {risk ? `${(risk.factors.onTimeDeliveryRate * 100).toFixed(1)}%` : 'n/a'}
                </li>
                <li>
                  <strong>Geopolitical risk:</strong>{' '}
                  {risk?.factors.geopoliticalRisk.toFixed(2) ?? 'n/a'}
                </li>
              </ul>
            </article>

            <article className="card">
              <h3>Recommendations</h3>
              <ul className="list">
                {(risk?.recommendations ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {(risk?.recommendations ?? []).length === 0 && (
                  <li>No recommendations returned.</li>
                )}
              </ul>
            </article>
          </section>

          <section className="card">
            <h3>Critical Dependencies</h3>
            <ul className="list">
              {(risk?.criticalFor ?? []).map((entry) => (
                <li key={`${entry.product}-${entry.component}`}>
                  <strong>{entry.product}</strong> · {entry.component} · impact {entry.impact} ·
                  alternatives {entry.alternatives}
                </li>
              ))}
              {(risk?.criticalFor ?? []).length === 0 && <li>No dependencies returned.</li>}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  );
}
