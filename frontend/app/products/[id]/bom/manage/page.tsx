import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { BomCrud } from '@/components/bom-crud';
import { safeFetchJson } from '@/lib/api';
import type { BomEntry, Product } from '@/lib/types';

type Params = Promise<{ id: string }>;

type DetailedBom = {
  product: Product;
  generatedAt: string;
  components: BomEntry[];
};

export default async function BomManagePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  const [product, detailedBom] = await Promise.all([
    safeFetchJson<Product | null>(`/products/${id}`, null),
    safeFetchJson<DetailedBom | null>(`/products/${id}/bom/detailed`, null),
  ]);

  return (
    <AppShell
      title={`BOM Management: ${product?.name ?? id}`}
      subtitle="Edit and remove BOM relationships here. Add new ones from Component Assignment."
    >
      {!product && (
        <section className="card">
          <h3>Product not found</h3>
          <p>The API did not return this product.</p>
          <Link href="/products" className="pill">
            Back To Products
          </Link>
        </section>
      )}

      {product && (
        <>
          <section className="filters">
            <Link href={`/products/${id}`} className="pill">
              Back To Product Detail
            </Link>
            <Link href={`/components/manage?productId=${encodeURIComponent(id)}`} className="pill">
              Assign Existing Components
            </Link>
          </section>

          <BomCrud
            productId={id}
            components={detailedBom?.components ?? []}
          />
        </>
      )}
    </AppShell>
  );
}
