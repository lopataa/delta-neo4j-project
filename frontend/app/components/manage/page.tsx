import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ComponentsAssignment } from '@/components/components-assignment';
import { safeFetchJson } from '@/lib/api';
import type { BomEntry, ComponentNode, Product } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function ComponentsManagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedProductId = first(params.productId);

  const [products, components] = await Promise.all([
    safeFetchJson<Product[]>('/products', []),
    safeFetchJson<ComponentNode[]>('/components', []),
  ]);

  let componentCatalog = components;

  if (componentCatalog.length === 0 && products.length > 0) {
    type DetailedBom = {
      product: Product;
      generatedAt: string;
      components: BomEntry[];
    };

    const detailedBoms = await Promise.all(
      products.map((product) =>
        safeFetchJson<DetailedBom | null>(`/products/${product.id}/bom/detailed`, null),
      ),
    );

    const byId = new Map<
      string,
      {
        component: ComponentNode;
        productIds: Set<string>;
      }
    >();

    detailedBoms.forEach((bom, index) => {
      const productId = products[index]?.id;
      if (!bom || !productId) {
        return;
      }

      bom.components.forEach((entry) => {
        const existing = byId.get(entry.component.id);
        if (existing) {
          existing.productIds.add(productId);
          return;
        }

        byId.set(entry.component.id, {
          component: {
            id: entry.component.id,
            name: entry.component.name,
            price: entry.component.price,
            quantity: entry.quantity,
            criticality: entry.component.criticality,
            usedInProducts: 1,
          },
          productIds: new Set([productId]),
        });
      });
    });

    componentCatalog = [...byId.values()]
      .map(({ component, productIds }) => ({
        ...component,
        usedInProducts: productIds.size,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  const defaultProductId = products.find((product) => product.id === requestedProductId)?.id;
  const initialProductId = defaultProductId ?? products[0]?.id ?? '';

  return (
    <AppShell
      title="Component Assignment"
      subtitle="Search reusable components and attach them to a product BOM."
    >
      <section className="filters">
        <Link href="/products" className="pill">
          Back To Products
        </Link>
      </section>

      <ComponentsAssignment
        products={products}
        components={componentCatalog}
        initialProductId={initialProductId}
      />
    </AppShell>
  );
}
