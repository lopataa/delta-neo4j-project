import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { safeFetchJson } from '@/lib/api';
import type { Product } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = pickFirst(params.q).toLowerCase();
  const status = pickFirst(params.status).toLowerCase();

  const products = await safeFetchJson<Product[]>('/products', []);

  const filtered = products.filter((product) => {
    const queryMatch =
      q.length === 0 ||
      product.name.toLowerCase().includes(q) ||
      product.sku.toLowerCase().includes(q);

    const statusMatch = status.length === 0 || status === 'all' || product.status === status;

    return queryMatch && statusMatch;
  });

  return (
    <AppShell
      title="Products Catalog"
      subtitle="Search and browse products. Create/edit operations are on the management page."
    >
      <form className="filters" method="get">
        <div className="filters-field">
          <label htmlFor="products-filter-query">Search</label>
          <input
            id="products-filter-query"
            name="q"
            placeholder="Search by name or SKU"
            defaultValue={pickFirst(params.q)}
          />
        </div>
        <div className="filters-field">
          <label htmlFor="products-filter-status">Status</label>
          <select
            id="products-filter-status"
            name="status"
            defaultValue={pickFirst(params.status) || 'all'}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
        <button type="submit">Filter ✨</button>
        <Link href="/products/manage" className="pill">
          Manage Products
        </Link>
      </form>

      <section className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Status</th>
              <th>Price</th>
              <th>Weight</th>
              <th>Lead Time</th>
              <th>BOM Components</th>
              <th>Suppliers</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id}>
                <td>
                  <Link href={`/products/${product.id}`}>
                    <strong>{product.name}</strong>
                  </Link>
                  <div className="small mono">{product.id}</div>
                </td>
                <td className="mono">{product.sku}</td>
                <td>
                  <span className={`tag status-${product.status}`}>{product.status}</span>
                </td>
                <td>${product.price}</td>
                <td>{product.weight} kg</td>
                <td>{product.leadTime} days</td>
                <td>{product.componentsCount ?? 0}</td>
                <td>{product.supplierCount ?? 0}</td>
                <td>
                  <Link href={`/products/${product.id}`} className="pill">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9}>No products matched the filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
