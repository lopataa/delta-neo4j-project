'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { clientRequest } from '@/lib/client-api';
import type { BomEntry } from '@/lib/types';

type BomDraft = {
  id: string;
  name: string;
  price: string;
  quantity: string;
  criticality: string;
  position: string;
};

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDraft(entry: BomEntry): BomDraft {
  return {
    id: entry.component.id,
    name: entry.component.name,
    price: String(entry.component.price),
    quantity: String(entry.quantity),
    criticality: entry.component.criticality,
    position: String(entry.position),
  };
}

type BomCrudProps = {
  productId: string;
  components: BomEntry[];
};

export function BomCrud({ productId, components }: BomCrudProps) {
  const router = useRouter();
  const [editDraft, setEditDraft] = useState<BomDraft | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');

  const sortedComponents = useMemo(
    () => {
      const byId = new Map<string, BomEntry>();

      [...components]
        .sort((left, right) => left.position - right.position)
        .forEach((entry) => {
          if (!byId.has(entry.component.id)) {
            byId.set(entry.component.id, entry);
          }
        });

      return [...byId.values()];
    },
    [components],
  );

  function buildPayload(draft: BomDraft) {
    const payload: Record<string, unknown> = {
      name: draft.name,
      price: toNumber(draft.price, 0),
      quantity: toNumber(draft.quantity, 1),
      criticality: draft.criticality,
      position: toNumber(draft.position, 1),
    };

    return payload;
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDraft) {
      return;
    }

    setBusyKey(`update-bom-${editDraft.id}`);
    setMessage('');

    try {
      await clientRequest(`/products/${productId}/bom/${editDraft.id}`, {
        method: 'PUT',
        body: JSON.stringify(buildPayload(editDraft)),
      });
      setMessage(`Component ${editDraft.id} updated ✅`);
      setEditDraft(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDelete(componentId: string) {
    const confirmed = window.confirm(
      `Delete BOM component ${componentId} from ${productId}?`,
    );
    if (!confirmed) {
      return;
    }

    setBusyKey(`delete-bom-${componentId}`);
    setMessage('');

    try {
      await clientRequest(`/products/${productId}/bom/${componentId}`, {
        method: 'DELETE',
      });
      setMessage(`Component ${componentId} removed 🗑️`);
      if (editDraft?.id === componentId) {
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
        <h3>Add Components</h3>
        <p>
          New BOM entries are assignment-only now to keep the component catalog reusable and
          clean.
        </p>
        <p className="small" style={{ marginTop: '0.5rem' }}>
          <Link href={`/components/manage?productId=${encodeURIComponent(productId)}`} className="pill">
            Open Component Assignment
          </Link>
        </p>
      </section>

      {editDraft && (
        <section className="card">
          <h3>Edit BOM Component: {editDraft.id}</h3>
          <form className="crud-grid" onSubmit={handleUpdate}>
            <div className="crud-field">
              <label htmlFor="bom-edit-name">Component Name</label>
              <input
                id="bom-edit-name"
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
              <label htmlFor="bom-edit-price">Component Price</label>
              <input
                id="bom-edit-price"
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
              <label htmlFor="bom-edit-quantity">BOM Quantity</label>
              <input
                id="bom-edit-quantity"
                type="number"
                required
                value={editDraft.quantity}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, quantity: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="bom-edit-position">BOM Position</label>
              <input
                id="bom-edit-position"
                type="number"
                required
                value={editDraft.position}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, position: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="bom-edit-criticality">Criticality</label>
              <select
                id="bom-edit-criticality"
                value={editDraft.criticality}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, criticality: event.target.value } : draft,
                  )
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div className="inline-actions">
              <button type="submit" disabled={busyKey === `update-bom-${editDraft.id}`}>
                {busyKey === `update-bom-${editDraft.id}` ? 'Saving...' : 'Save Changes'}
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
              <th>Component</th>
              <th>Criticality</th>
              <th>Quantity</th>
              <th>Position</th>
              <th>Suppliers</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedComponents.map((entry) => (
              <tr key={entry.component.id}>
                <td>
                  <strong>{entry.component.name}</strong>
                  <div className="small mono">{entry.component.id}</div>
                </td>
                <td>
                  <span className={`tag status-${entry.component.criticality}`}>
                    {entry.component.criticality}
                  </span>
                </td>
                <td>{entry.quantity}</td>
                <td>{entry.position}</td>
                <td>
                  {entry.suppliers.length === 0 && 'No supplier'}
                  {entry.suppliers.map((supplier, index) => (
                    <span key={supplier.id}>
                      {index > 0 && ', '}
                      <Link href={`/suppliers/${supplier.id}`}>{supplier.name}</Link>
                    </span>
                  ))}
                </td>
                <td>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button-muted"
                      onClick={() => setEditDraft(toDraft(entry))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      disabled={busyKey === `delete-bom-${entry.component.id}`}
                      onClick={() => handleDelete(entry.component.id)}
                    >
                      {busyKey === `delete-bom-${entry.component.id}` ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedComponents.length === 0 && (
              <tr>
                <td colSpan={6}>No BOM components defined.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="feedback">{message}</p>}
    </>
  );
}
