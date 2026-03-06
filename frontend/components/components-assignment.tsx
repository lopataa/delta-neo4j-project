'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { clientRequest } from '@/lib/client-api';
import type { BomEntry, ComponentNode, Product } from '@/lib/types';

type DetailedBomResponse = {
  product: Product;
  generatedAt: string;
  components: BomEntry[];
};

type ComponentsAssignmentProps = {
  products: Product[];
  components: ComponentNode[];
  initialProductId: string;
};

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ComponentsAssignment({
  products,
  components,
  initialProductId,
}: ComponentsAssignmentProps) {
  const router = useRouter();
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [componentSearch, setComponentSearch] = useState('');
  const [defaultQuantity, setDefaultQuantity] = useState('1');
  const [bomComponents, setBomComponents] = useState<BomEntry[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');

  const uniqueComponents = useMemo(() => {
    const byId = new Map<string, ComponentNode>();
    components.forEach((component) => {
      if (!byId.has(component.id)) {
        byId.set(component.id, component);
      }
    });

    return [...byId.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [components]);

  useEffect(() => {
    if (!selectedProductId) {
      setBomComponents([]);
      return;
    }

    let cancelled = false;
    setLoadingBom(true);

    clientRequest<DetailedBomResponse>(`/products/${selectedProductId}/bom/detailed`)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setBomComponents(response.components ?? []);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setMessage(error instanceof Error ? error.message : 'Failed to load BOM');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBom(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  const existingComponentIds = useMemo(
    () => new Set(bomComponents.map((entry) => entry.component.id)),
    [bomComponents],
  );

  const nextPosition = useMemo(() => {
    return bomComponents.reduce((max, entry) => Math.max(max, entry.position), 0) + 1;
  }, [bomComponents]);

  const filteredComponents = useMemo(() => {
    const query = componentSearch.trim().toLowerCase();
    if (!query) {
      return uniqueComponents;
    }

    return uniqueComponents.filter((component) => {
      return (
        component.name.toLowerCase().includes(query) ||
        component.id.toLowerCase().includes(query)
      );
    });
  }, [uniqueComponents, componentSearch]);

  async function handleAssign(component: ComponentNode) {
    if (!selectedProductId) {
      return;
    }

    setBusyKey(component.id);
    setMessage('');

    try {
      await clientRequest(`/products/${selectedProductId}/bom`, {
        method: 'POST',
        body: JSON.stringify({
          id: component.id,
          name: component.name,
          price: component.price,
          criticality: component.criticality,
          quantity: Math.max(1, toNumber(defaultQuantity, 1)),
          position: nextPosition,
        }),
      });

      const refreshed = await clientRequest<DetailedBomResponse>(
        `/products/${selectedProductId}/bom/detailed`,
      );
      setBomComponents(refreshed.components ?? []);
      setMessage(`Assigned ${component.name} to ${selectedProductId} ✅`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Assignment failed');
    } finally {
      setBusyKey('');
    }
  }

  return (
    <>
      <section className="card">
        <h3>Assign Existing Component To Product</h3>
        <form className="filters" onSubmit={(event) => event.preventDefault()}>
          <div className="filters-field">
            <label htmlFor="component-assignment-product">Target Product</label>
            <select
              id="component-assignment-product"
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.id})
                </option>
              ))}
            </select>
          </div>

          <div className="filters-field">
            <label htmlFor="component-assignment-search">Search Components</label>
            <input
              id="component-assignment-search"
              value={componentSearch}
              onChange={(event) => setComponentSearch(event.target.value)}
              placeholder="Search by component name or ID"
            />
          </div>

          <div className="filters-field">
            <label htmlFor="component-assignment-quantity">Default Quantity</label>
            <input
              id="component-assignment-quantity"
              type="number"
              min={1}
              value={defaultQuantity}
              onChange={(event) => setDefaultQuantity(event.target.value)}
            />
          </div>

          {selectedProductId && (
            <>
              <Link href={`/products/${selectedProductId}`} className="pill">
                Open Product Detail
              </Link>
              <Link href={`/products/${selectedProductId}/bom/manage`} className="pill">
                Open BOM Management
              </Link>
            </>
          )}
        </form>
      </section>

      <section className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Criticality</th>
              <th>Used In Products</th>
              <th>Status In Selected Product</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredComponents.map((component) => {
              const alreadyInBom = existingComponentIds.has(component.id);
              const isBusy = busyKey === component.id;

              return (
                <tr key={component.id}>
                  <td>
                    <strong>{component.name}</strong>
                    <div className="small mono">{component.id}</div>
                    <div className="small">${component.price}</div>
                  </td>
                  <td>
                    <span className={`tag status-${component.criticality}`}>
                      {component.criticality}
                    </span>
                  </td>
                  <td>{component.usedInProducts ?? 0}</td>
                  <td>
                    {loadingBom ? (
                      <span className="small">Loading BOM…</span>
                    ) : alreadyInBom ? (
                      <span className="tag status-warning">Already In BOM</span>
                    ) : (
                      <span className="tag status-active">Not Added Yet</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button-muted"
                      disabled={!selectedProductId || loadingBom || alreadyInBom || isBusy}
                      onClick={() => handleAssign(component)}
                    >
                      {isBusy ? 'Adding...' : 'Add To Product'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredComponents.length === 0 && (
              <tr>
                <td colSpan={5}>
                  {uniqueComponents.length === 0
                    ? 'No reusable components found in catalog yet.'
                    : 'No component matched your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="feedback">{message}</p>}
    </>
  );
}
