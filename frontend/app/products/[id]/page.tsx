import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { CompositionVisualizer } from '@/components/composition-visualizer';
import { ExpandableCard } from '@/components/expandable-card';
import { safeFetchJson } from '@/lib/api';
import type { BomEntry, Product } from '@/lib/types';

type Params = Promise<{ id: string }>;

type DetailedBom = {
  product: Product;
  generatedAt: string;
  components: BomEntry[];
};

type BomTree = {
  product: Product;
  components: BomEntry[];
};

type AlternativesResponse = {
  productId: string;
  alternatives: Array<{
    componentId: string;
    componentName: string;
    suppliers: Array<{
      company: {
        id: string;
        name: string;
        reliability: number;
      };
      price: number;
      leadTime: number;
      minOrder: number;
    }>;
  }>;
};

type StockForecast = {
  currentStock: number;
  horizonMonths: number;
  reorderPoint: number;
  projection: Array<{
    month: string;
    projectedStock: number;
    monthlyDemand: number;
    replenishment: number;
  }>;
};

function maxFrom(values: number[]): number {
  const max = Math.max(...values, 0);
  return max <= 0 ? 1 : max;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  const [product, detailedBom, bomTree, alternatives, stock] = await Promise.all([
    safeFetchJson<Product | null>(`/products/${id}`, null),
    safeFetchJson<DetailedBom | null>(`/products/${id}/bom/detailed`, null),
    safeFetchJson<BomTree | null>(`/products/${id}/bom/tree`, null),
    safeFetchJson<AlternativesResponse>(`/products/${id}/alternative-suppliers`, {
      productId: id,
      alternatives: [],
    }),
    safeFetchJson<StockForecast>(
      `/analytics/stock-levels?product=${encodeURIComponent(id)}&horizon=${encodeURIComponent('months=6')}`,
      {
        currentStock: 0,
        horizonMonths: 6,
        reorderPoint: 0,
        projection: [],
      },
    ),
  ]);

  const priceSeries = detailedBom?.components
    .flatMap((entry) => entry.priceHistory ?? [])
    .map((entry) => entry.price);

  const stockSeries = stock.projection.map((entry) => entry.projectedStock);
  const compositionEntries = [...(bomTree?.components ?? [])].sort(
    (left, right) => {
      const depthDelta = (left.depth ?? 1) - (right.depth ?? 1);
      if (depthDelta !== 0) {
        return depthDelta;
      }

      const positionDelta = left.position - right.position;
      if (positionDelta !== 0) {
        return positionDelta;
      }

      return left.component.name.localeCompare(right.component.name);
    },
  );
  const componentEntries = [...(detailedBom?.components ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  return (
    <AppShell
      title={`Product Detail: ${product?.name ?? id}`}
      subtitle="BOM tree, supplier alternatives, cost movement, and stock forecast."
    >
      {!product && (
        <section className="card">
          <h3>Product not found</h3>
          <p>The API did not return this product.</p>
        </section>
      )}

      {product && (
        <>
          <section className="kpi-grid">
            <article className="kpi-card">
              <p className="kpi-label">SKU</p>
              <p className="kpi-value mono">{product.sku}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Unit Price</p>
              <p className="kpi-value">${product.price}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Lead Time</p>
              <p className="kpi-value">{product.leadTime}d</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Current Stock</p>
              <p className="kpi-value">{stock.currentStock}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Reorder Point</p>
              <p className="kpi-value">{stock.reorderPoint}</p>
            </article>
          </section>

          <ExpandableCard title="Composition Map" className="composition-card">
            <CompositionVisualizer product={product} productId={id} entries={compositionEntries} />
          </ExpandableCard>

          <ExpandableCard title="Price History (derived)">
            <div className="chart-row">
              {componentEntries.slice(0, 6).map((entry) => {
                const latestPrice = entry.priceHistory?.at(-1)?.price ?? entry.component.price;
                const maxPrice = maxFrom(priceSeries ?? []);
                const width = `${Math.max(5, (latestPrice / maxPrice) * 100)}%`;

                return (
                  <div className="chart-line" key={`price-${entry.component.id}`}>
                    <div className="chart-label">
                      <span>{entry.component.name}</span>
                      <span>${latestPrice.toFixed(2)}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ExpandableCard>

          <section className="grid-2">
            <ExpandableCard title="Alternative Suppliers">
              <ul className="list">
                {alternatives.alternatives.map((entry) => (
                  <li key={entry.componentId}>
                    <strong>{entry.componentName}</strong>
                    <div className="small">
                      {(entry.suppliers ?? []).length === 0 && 'No alternatives'}
                      {(entry.suppliers ?? []).map((supplier, index) => (
                        <span key={supplier.company.id}>
                          {index > 0 && ' | '}
                          <Link href={`/suppliers/${supplier.company.id}`}>
                            {supplier.company.name}
                          </Link>{' '}
                          (${supplier.price}, {supplier.leadTime}d, rel{' '}
                          {supplier.company.reliability})
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
                {alternatives.alternatives.length === 0 && (
                  <li>No alternatives available for this product.</li>
                )}
              </ul>
            </ExpandableCard>

            <ExpandableCard title="Stock Forecast (6 months)">
              <div className="chart-row">
                {stock.projection.map((point) => {
                  const maxStock = maxFrom(stockSeries);
                  const width = `${Math.max(5, (point.projectedStock / maxStock) * 100)}%`;

                  return (
                    <div className="chart-line" key={point.month}>
                      <div className="chart-label">
                        <span>{point.month}</span>
                        <span>{point.projectedStock} units</span>
                      </div>
                      <div className="chart-track">
                        <div className="chart-fill" style={{ width }} />
                      </div>
                    </div>
                  );
                })}
                {stock.projection.length === 0 && <p>No forecast data available.</p>}
              </div>
            </ExpandableCard>
          </section>
          <section className="card">
            <h3>BOM Management</h3>
            <p>
              Create and edit BOM components on the dedicated management page.
            </p>
            <p className="small" style={{ marginTop: '0.5rem' }}>
              <Link href={`/products/${id}/bom/manage`} className="pill">
                Open BOM Management
              </Link>
              {' '}
              <Link href={`/components/manage?productId=${encodeURIComponent(id)}`} className="pill">
                Assign Existing Components
              </Link>
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
