import { AppShell } from '@/components/app-shell';
import { safeFetchJson } from '@/lib/api';
import type { Company } from '@/lib/types';
import Link from 'next/link';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const selectedType = first(params.type).toLowerCase();
  const selectedCountry = first(params.country).toLowerCase();
  const reliabilityThreshold = Number(first(params.reliability) || '0');
  const selectedSupplierId = first(params.supplier);

  const companies = await safeFetchJson<Company[]>('/companies', []);

  const suppliers = companies.filter((company) => {
    const typeMatch =
      selectedType.length === 0 || selectedType === 'all'
        ? true
        : company.type === selectedType;

    const countryMatch =
      selectedCountry.length === 0
        ? true
        : company.country.toLowerCase().includes(selectedCountry);

    const reliabilityMatch = company.reliability >= reliabilityThreshold;

    return typeMatch && countryMatch && reliabilityMatch;
  });

  const preferredSupplier =
    selectedSupplierId ||
    suppliers.find((company) => ['supplier', 'manufacturer'].includes(company.type))?.id ||
    '';

  const risk = preferredSupplier
    ? await safeFetchJson<RiskAssessment | null>(
        `/companies/${preferredSupplier}/risk-assessment`,
        null,
      )
    : null;

  return (
    <AppShell
      title="Suppliers & Reliability"
      subtitle="Filter suppliers and inspect risk scoring. Create/edit operations are on management page."
    >
      <form className="filters" method="get">
        <div className="filters-field">
          <label htmlFor="suppliers-filter-type">Company Type</label>
          <select id="suppliers-filter-type" name="type" defaultValue={first(params.type) || 'all'}>
            <option value="all">All company types</option>
            <option value="supplier">Supplier</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="distributor">Distributor</option>
            <option value="retailer">Retailer</option>
            <option value="customer">Customer</option>
          </select>
        </div>

        <div className="filters-field">
          <label htmlFor="suppliers-filter-country">Country</label>
          <input
            id="suppliers-filter-country"
            name="country"
            placeholder="Country contains..."
            defaultValue={first(params.country)}
          />
        </div>

        <div className="filters-field">
          <label htmlFor="suppliers-filter-reliability">Min Reliability</label>
          <input
            id="suppliers-filter-reliability"
            name="reliability"
            type="number"
            step="0.01"
            min="0"
            max="1"
            placeholder="0 to 1"
            defaultValue={first(params.reliability)}
          />
        </div>

        <button type="submit">Apply Filters</button>
        <Link href="/suppliers/manage" className="pill">
          Manage Companies
        </Link>
      </form>

      <section className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Type</th>
              <th>Country</th>
              <th>Coordinates</th>
              <th>Reliability</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((company) => (
              <tr key={company.id}>
                <td>
                  <Link href={`/suppliers/${company.id}`}>
                    <strong>{company.name}</strong>
                  </Link>
                  <div className="small mono">{company.id}</div>
                </td>
                <td>
                  <span className="tag">{company.type}</span>
                </td>
                <td>{company.country}</td>
                <td className="mono">{company.coordinates}</td>
                <td>{company.reliability.toFixed(2)}</td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5}>No companies matched these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>Risk Assessment</h3>
          {!risk && <p>Choose a supplier to load risk details.</p>}
          {risk && (
            <>
              <p>
                <Link href={`/suppliers/${risk.supplierId}`}>
                  <strong>{risk.company}</strong>
                </Link>{' '}
                risk score:{' '}
                <span className="pill">{risk.riskScore.toFixed(2)}</span>
              </p>
              <ul className="list" style={{ marginTop: '0.5rem' }}>
                <li>Reliability score: {risk.factors.reliabilityScore.toFixed(2)}</li>
                <li>On-time delivery: {(risk.factors.onTimeDeliveryRate * 100).toFixed(1)}%</li>
                <li>Geopolitical risk: {risk.factors.geopoliticalRisk.toFixed(2)}</li>
                <li>Financial stability: {risk.factors.financialStability.toFixed(2)}</li>
              </ul>
            </>
          )}
        </article>

        <article className="card">
          <h3>Recommendations</h3>
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
