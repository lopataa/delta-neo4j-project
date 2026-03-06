'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { clientRequest } from '@/lib/client-api';
import type { Product } from '@/lib/types';

type ProductDraft = {
  id: string;
  name: string;
  sku: string;
  price: string;
  weight: string;
  leadTime: string;
  status: string;
};

const emptyDraft: ProductDraft = {
  id: '',
  name: '',
  sku: '',
  price: '',
  weight: '',
  leadTime: '',
  status: 'active',
};

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDraft(product: Product): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: String(product.price),
    weight: String(product.weight),
    leadTime: String(product.leadTime),
    status: product.status,
  };
}

function toPayload(draft: ProductDraft, includeId = true) {
  const payload: Record<string, unknown> = {
    name: draft.name,
    sku: draft.sku,
    price: toNumber(draft.price, 0),
    weight: toNumber(draft.weight, 0),
    leadTime: toNumber(draft.leadTime, 14),
    status: draft.status,
  };

  if (includeId && draft.id.trim().length > 0) {
    payload.id = draft.id.trim();
  }

  return payload;
}

type ProductsCrudProps = {
  products: Product[];
};

export function ProductsCrud({ products }: ProductsCrudProps) {
  const router = useRouter();
  const [createDraft, setCreateDraft] = useState<ProductDraft>(emptyDraft);
  const [editDraft, setEditDraft] = useState<ProductDraft | null>(null);
  const [busyKey, setBusyKey] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  const sortedProducts = useMemo(
    () => [...products].sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey('create');
    setMessage('');

    try {
      await clientRequest('/products', {
        method: 'POST',
        body: JSON.stringify(toPayload(createDraft, true)),
      });
      setCreateDraft(emptyDraft);
      setMessage('Product created ✅');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Create failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDraft) {
      return;
    }

    setBusyKey(`update-${editDraft.id}`);
    setMessage('');

    try {
      await clientRequest(`/products/${editDraft.id}`, {
        method: 'PUT',
        body: JSON.stringify(toPayload(editDraft, false)),
      });
      setMessage(`Product ${editDraft.id} updated ✅`);
      setEditDraft(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(`Delete product ${id}?`);
    if (!confirmed) {
      return;
    }

    setBusyKey(`delete-${id}`);
    setMessage('');

    try {
      await clientRequest(`/products/${id}`, {
        method: 'DELETE',
      });
      setMessage(`Product ${id} deleted 🗑️`);
      if (editDraft?.id === id) {
        setEditDraft(null);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setBusyKey('');
    }
  }

  return (
    <>
      <section className="card">
        <h3>Create Product</h3>
        <form className="crud-grid" onSubmit={handleCreate}>
          <div className="crud-field">
            <label htmlFor="product-create-id">Product ID (optional)</label>
            <input
              id="product-create-id"
              value={createDraft.id}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, id: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="product-create-name">Name</label>
            <input
              id="product-create-name"
              required
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, name: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="product-create-sku">SKU</label>
            <input
              id="product-create-sku"
              required
              value={createDraft.sku}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, sku: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="product-create-price">Price</label>
            <input
              id="product-create-price"
              type="number"
              step="0.01"
              required
              value={createDraft.price}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, price: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="product-create-weight">Weight (kg)</label>
            <input
              id="product-create-weight"
              type="number"
              step="0.01"
              required
              value={createDraft.weight}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, weight: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="product-create-lead-time">Lead Time (days)</label>
            <input
              id="product-create-lead-time"
              type="number"
              required
              value={createDraft.leadTime}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, leadTime: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="product-create-status">Status</label>
            <select
              id="product-create-status"
              value={createDraft.status}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, status: event.target.value }))
              }
            >
              <option value="active">active</option>
              <option value="discontinued">discontinued</option>
            </select>
          </div>
          <button type="submit" disabled={busyKey === 'create'}>
            {busyKey === 'create' ? 'Creating...' : 'Create Product'}
          </button>
        </form>
      </section>

      {editDraft && (
        <section className="card">
          <h3>Edit Product: {editDraft.id}</h3>
          <form className="crud-grid" onSubmit={handleUpdate}>
            <div className="crud-field">
              <label htmlFor="product-edit-name">Name</label>
              <input
                id="product-edit-name"
                required
                value={editDraft.name}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, name: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="product-edit-sku">SKU</label>
              <input
                id="product-edit-sku"
                required
                value={editDraft.sku}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, sku: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="product-edit-price">Price</label>
              <input
                id="product-edit-price"
                type="number"
                step="0.01"
                required
                value={editDraft.price}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, price: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="product-edit-weight">Weight (kg)</label>
              <input
                id="product-edit-weight"
                type="number"
                step="0.01"
                required
                value={editDraft.weight}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, weight: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="product-edit-lead-time">Lead Time (days)</label>
              <input
                id="product-edit-lead-time"
                type="number"
                required
                value={editDraft.leadTime}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, leadTime: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="product-edit-status">Status</label>
              <select
                id="product-edit-status"
                value={editDraft.status}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, status: event.target.value } : draft,
                  )
                }
              >
                <option value="active">active</option>
                <option value="discontinued">discontinued</option>
              </select>
            </div>
            <div className="inline-actions">
              <button type="submit" disabled={busyKey === `update-${editDraft.id}`}>
                {busyKey === `update-${editDraft.id}` ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                className="button-muted"
                onClick={() => setEditDraft(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((product) => (
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
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button-muted"
                      onClick={() => setEditDraft(toDraft(product))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      disabled={busyKey === `delete-${product.id}`}
                      onClick={() => handleDelete(product.id)}
                    >
                      {busyKey === `delete-${product.id}` ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedProducts.length === 0 && (
              <tr>
                <td colSpan={9}>No products matched the filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="feedback">{message}</p>}
    </>
  );
}
