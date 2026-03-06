import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { OrdersCrud } from '@/components/orders-crud';
import { safeFetchJson } from '@/lib/api';
import type { Company, LocationNode, Order, Product, RouteNode } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function OrdersManagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const statusFilter = first(params.status);

  const [orders, products, companies, routeCatalog, locationCatalog] = await Promise.all([
    safeFetchJson<Order[]>('/orders', []),
    safeFetchJson<Product[]>('/products', []),
    safeFetchJson<Company[]>('/companies', []),
    safeFetchJson<RouteNode[]>('/routes', []),
    safeFetchJson<LocationNode[]>('/locations', []),
  ]);

  const filteredOrders = orders.filter((order) => {
    return statusFilter.length === 0 || statusFilter === 'all'
      ? true
      : order.status === statusFilter;
  });

  const routeOptionsMap = new Map<string, RouteNode>();
  routeCatalog.forEach((route) => {
    routeOptionsMap.set(route.id, route);
  });
  orders.forEach((order) => {
    if (order.route?.id && order.route?.name && !routeOptionsMap.has(order.route.id)) {
      routeOptionsMap.set(order.route.id, {
        id: order.route.id,
        name: order.route.name,
        distance: order.route.distance ?? 0,
        estimatedTime: order.route.estimatedTime ?? 0,
        cost: 0,
        reliability: order.route.reliability ?? 0.9,
        locationIds: order.route.locationIds ?? [],
      });
    }
  });

  const routeOptions = Array.from(routeOptionsMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  return (
    <AppShell
      title="Order Management"
      subtitle="Create orders and edit supply paths (hubs, nodes, and routes) in one workflow."
    >
      <form className="filters" method="get">
        <div className="filters-field">
          <label htmlFor="orders-manage-status">Status</label>
          <select id="orders-manage-status" name="status" defaultValue={statusFilter || 'all'}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_transit">In transit</option>
            <option value="delivered">Delivered</option>
            <option value="delayed">Delayed</option>
          </select>
        </div>
        <button type="submit">Filter</button>
        <Link href="/orders" className="pill">
          Back To Orders
        </Link>
      </form>

      <OrdersCrud
        orders={filteredOrders}
        products={products}
        companies={companies}
        routeOptions={routeOptions}
        locations={locationCatalog}
      />
    </AppShell>
  );
}
