import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ProductsCrud } from '@/components/products-crud';
import { safeFetchJson } from '@/lib/api';
import type { Product } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function ProductsManagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = first(params.q).toLowerCase();
  const status = first(params.status).toLowerCase();

  const products = await safeFetchJson<Product[]>('/products', []);

  const filtered = products.filter((product) => {
    const queryMatch =
      query.length === 0 ||
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query);

    const statusMatch =
      status.length === 0 || status === 'all' || product.status === status;

    return queryMatch && statusMatch;
  });

  return (
    <AppShell
      title="Product Management"
      subtitle="Create, edit, and remove products. Use the browse page for read-only catalog view."
    >
      <form className="filters" method="get">
        <div className="filters-field">
          <label htmlFor="products-manage-query">Search</label>
          <input
            id="products-manage-query"
            name="q"
            placeholder="Search by name or SKU"
            defaultValue={first(params.q)}
          />
        </div>
        <div className="filters-field">
          <label htmlFor="products-manage-status">Status</label>
          <select id="products-manage-status" name="status" defaultValue={first(params.status) || 'all'}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
        <button type="submit">Filter</button>
        <Link href="/products" className="pill">
          Back To Catalog
        </Link>
      </form>

      <ProductsCrud products={filtered} />
    </AppShell>
  );
}
