import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { OrdersCandidateMap } from '@/components/orders-candidate-map';
import { safeFetchJson } from '@/lib/api';
import type { Order, SupplyPathResponse } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type CostBreakdown = {
  orderId: string;
  totalCost: number;
  breakdown: {
    materials: number;
    manufacturing: number;
    logistics: number;
  };
};

type OptimalRoute = {
  route: Array<{
    id: string;
    name: string;
    coordinates?: string;
    type?: string;
  }>;
  distance: number;
  time: number;
  cost: number;
  reliability: number;
  optimizeBy?: string;
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function maxFrom(values: number[]): number {
  const max = Math.max(...values, 0);
  return max <= 0 ? 1 : max;
}

function withOrderSelection(status: string, orderId: string): string {
  const search = new URLSearchParams();

  if (status.length > 0) {
    search.set('status', status);
  }
  search.set('orderId', orderId);

  return `/orders?${search.toString()}`;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const statusFilter = first(params.status);
  const selectedOrderId = first(params.orderId);

  const orders = await safeFetchJson<Order[]>('/orders', []);

  const filteredOrders = orders.filter((order) => {
    return statusFilter.length === 0 || statusFilter === 'all'
      ? true
      : order.status === statusFilter;
  });

  const activeOrder =
    filteredOrders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0] ?? null;

  const supplyPath = activeOrder
    ? await safeFetchJson<SupplyPathResponse | null>(
        `/orders/${activeOrder.id}/supply-path`,
        null,
      )
    : null;

  const costBreakdown = activeOrder
    ? await safeFetchJson<CostBreakdown | null>(
        `/analytics/cost-breakdown/${activeOrder.id}`,
        null,
      )
    : null;

  const fromId = supplyPath?.path[0]?.location?.id;
  const toId = supplyPath?.path.at(-1)?.location?.id;

  const routeCandidates =
    fromId && toId
      ? await safeFetchJson<OptimalRoute[]>(
          `/routes/optimal?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}&weight=12&optimize=balanced`,
          [],
        )
      : [];

  const orderCostSeries = filteredOrders
    .slice(0, 8)
    .sort((left, right) => right.cost - left.cost);
  const maxOrderCost = maxFrom(orderCostSeries.map((order) => order.cost));
  const maxRouteCost = maxFrom(routeCandidates.map((route) => route.cost));
  const maxRouteTime = maxFrom(routeCandidates.map((route) => route.time));
  const maxRouteReliability = maxFrom(routeCandidates.map((route) => route.reliability));

  return (
    <AppShell
      title="Orders & Supply Path"
      subtitle="Browse orders and inspect graph path analytics. Create/edit operations are on management page."
    >
      <form className="filters" method="get">
        <div className="filters-field">
          <label htmlFor="orders-filter-status">Status</label>
          <select id="orders-filter-status" name="status" defaultValue={statusFilter || 'all'}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_transit">In transit</option>
            <option value="delivered">Delivered</option>
            <option value="delayed">Delayed</option>
          </select>
        </div>
        <button type="submit">Filter Orders</button>
        <Link href="/orders/manage" className="pill">
          Manage Orders
        </Link>
      </form>

      <section className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Customer</th>
              <th>Supplier</th>
              <th>Cost</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id}>
                <td className="mono">{order.id}</td>
                <td>
                  <span className={`tag status-${order.status}`}>{order.status}</span>
                </td>
                <td>{order.dueDate}</td>
                <td>
                  {order.from ? (
                    <Link href={`/suppliers/${order.from.id}`}>{order.from.name}</Link>
                  ) : (
                    'n/a'
                  )}
                </td>
                <td>
                  {order.placedWith ? (
                    <Link href={`/suppliers/${order.placedWith.id}`}>
                      {order.placedWith.name}
                    </Link>
                  ) : (
                    'n/a'
                  )}
                </td>
                <td>${order.cost}</td>
                <td>
                  <Link
                    className="pill"
                    href={withOrderSelection(statusFilter || 'all', order.id)}
                  >
                    View Path
                  </Link>
                </td>
              </tr>
            ))}
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={7}>No orders in this view.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>Supply Path Graph</h3>
          {!supplyPath && <p>Select an order to load path stages.</p>}
          {supplyPath && (
            <>
              <p>
                <span className="mono">{supplyPath.orderId}</span> · total duration{' '}
                <strong>{supplyPath.totalDuration}</strong>
              </p>
              <ul className="list" style={{ marginTop: '0.55rem' }}>
                {supplyPath.path.map((stage) => (
                  <li key={`${stage.stage}-${stage.name}`}>
                    <strong>
                      Stage {stage.stage}: {stage.name}
                    </strong>{' '}
                    ({stage.status})
                    <div className="small">
                      {stage.company?.id ? (
                        <Link href={`/suppliers/${stage.company.id}`}>{stage.company.name}</Link>
                      ) : (
                        'No company'
                      )}{' '}
                      · {stage.location?.name ?? 'No location'}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="small" style={{ marginTop: '0.6rem' }}>
                Risk factors: {supplyPath.riskFactors.join(' / ')}
              </p>
            </>
          )}
        </article>

        <article className="card">
          <h3>Cost Breakdown</h3>
          {!costBreakdown && <p>No breakdown available.</p>}
          {costBreakdown && (
            <ul className="list">
              <li>Total: ${costBreakdown.totalCost.toFixed(2)}</li>
              <li>Materials: ${costBreakdown.breakdown.materials.toFixed(2)}</li>
              <li>Manufacturing: ${costBreakdown.breakdown.manufacturing.toFixed(2)}</li>
              <li>Logistics: ${costBreakdown.breakdown.logistics.toFixed(2)}</li>
            </ul>
          )}
        </article>
      </section>

      <section className="grid-2">
        <article className="card">
          <h3>Order Cost Snapshot</h3>
          <div className="chart-row">
            {orderCostSeries.map((order) => {
              const width = `${Math.max(5, (order.cost / maxOrderCost) * 100)}%`;

              return (
                <div className="chart-line" key={`order-cost-${order.id}`}>
                  <div className="chart-label">
                    <span className="mono">{order.id}</span>
                    <span>${order.cost.toFixed(2)}</span>
                  </div>
                  <div className="chart-track">
                    <div className="chart-fill" style={{ width }} />
                  </div>
                </div>
              );
            })}
            {orderCostSeries.length === 0 && <p>No orders for chart.</p>}
          </div>
        </article>

        <article className="card">
          <h3>Route Candidate Scores</h3>
          <div className="chart-row">
            {routeCandidates.map((route, index) => {
              const costWidth = `${Math.max(5, (route.cost / maxRouteCost) * 100)}%`;
              const timeWidth = `${Math.max(5, (route.time / maxRouteTime) * 100)}%`;
              const reliabilityWidth = `${Math.max(
                5,
                (route.reliability / maxRouteReliability) * 100,
              )}%`;

              return (
                <div key={`route-score-${index}`} className="card" style={{ padding: '0.5rem' }}>
                  <p className="small" style={{ marginBottom: '0.35rem' }}>
                    Candidate {index + 1}
                  </p>
                  <div className="chart-line">
                    <div className="chart-label">
                      <span>Cost</span>
                      <span>${route.cost}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: costWidth }} />
                    </div>
                  </div>
                  <div className="chart-line">
                    <div className="chart-label">
                      <span>Time</span>
                      <span>{route.time}d</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: timeWidth }} />
                    </div>
                  </div>
                  <div className="chart-line">
                    <div className="chart-label">
                      <span>Reliability</span>
                      <span>{route.reliability}</span>
                    </div>
                    <div className="chart-track">
                      <div className="chart-fill" style={{ width: reliabilityWidth }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {routeCandidates.length === 0 && <p>No route candidates for chart.</p>}
          </div>
        </article>
      </section>

      <section className="card">
        <h3>Route Map Preview</h3>
        <OrdersCandidateMap routes={routeCandidates} />
        <div className="route-candidate-list">
          {routeCandidates.map((route, index) => (
            <article
              key={`route-${index}`}
              className={`route-candidate-card ${index === 0 ? 'route-candidate-card-featured' : ''}`}
            >
              <header className="route-candidate-card-head">
                <div>
                  <p className="route-candidate-title">Candidate {index + 1}</p>
                  <p className="route-candidate-subtitle">
                    {route.route.length} hubs · optimized for {route.optimizeBy ?? 'balanced'}
                  </p>
                </div>
                {index === 0 && <span className="route-candidate-badge">Recommended</span>}
              </header>

              <div className="route-candidate-metrics">
                <span className="route-candidate-metric">
                  Distance <strong>{route.distance} km</strong>
                </span>
                <span className="route-candidate-metric">
                  Time <strong>{route.time} d</strong>
                </span>
                <span className="route-candidate-metric">
                  Cost <strong>${route.cost}</strong>
                </span>
                <span className="route-candidate-metric">
                  Reliability <strong>{route.reliability}</strong>
                </span>
              </div>

              <div className="route-line route-line-friendly">
                {route.route.map((location, locationIndex) => (
                  <span key={location.id}>
                    <span className="route-node">{location.name}</span>
                    {locationIndex < route.route.length - 1 && (
                      <span className="route-sep"> → </span>
                    )}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
