'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { clientRequest } from '@/lib/client-api';
import type { Company } from '@/lib/types';

type CompanyDraft = {
  id: string;
  name: string;
  type: string;
  country: string;
  coordinates: string;
  reliability: string;
};

const emptyDraft: CompanyDraft = {
  id: '',
  name: '',
  type: 'supplier',
  country: '',
  coordinates: '',
  reliability: '0.85',
};

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDraft(company: Company): CompanyDraft {
  return {
    id: company.id,
    name: company.name,
    type: company.type,
    country: company.country,
    coordinates: company.coordinates,
    reliability: String(company.reliability),
  };
}

function toPayload(draft: CompanyDraft, includeId = true) {
  const payload: Record<string, unknown> = {
    name: draft.name,
    type: draft.type,
    country: draft.country,
    coordinates: draft.coordinates,
    reliability: Math.max(0, Math.min(1, toNumber(draft.reliability, 0.85))),
  };

  if (includeId && draft.id.trim().length > 0) {
    payload.id = draft.id.trim();
  }

  return payload;
}

type CompaniesCrudProps = {
  companies: Company[];
};

export function CompaniesCrud({ companies }: CompaniesCrudProps) {
  const router = useRouter();
  const [createDraft, setCreateDraft] = useState<CompanyDraft>(emptyDraft);
  const [editDraft, setEditDraft] = useState<CompanyDraft | null>(null);
  const [busyKey, setBusyKey] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  const sortedCompanies = useMemo(
    () => [...companies].sort((left, right) => left.name.localeCompare(right.name)),
    [companies],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey('create-company');
    setMessage('');

    try {
      await clientRequest('/companies', {
        method: 'POST',
        body: JSON.stringify(toPayload(createDraft, true)),
      });
      setCreateDraft(emptyDraft);
      setMessage('Company created ✅');
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

    setBusyKey(`update-company-${editDraft.id}`);
    setMessage('');

    try {
      await clientRequest(`/companies/${editDraft.id}`, {
        method: 'PUT',
        body: JSON.stringify(toPayload(editDraft, false)),
      });
      setMessage(`Company ${editDraft.id} updated ✅`);
      setEditDraft(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(`Delete company ${id}?`);
    if (!confirmed) {
      return;
    }

    setBusyKey(`delete-company-${id}`);
    setMessage('');

    try {
      await clientRequest(`/companies/${id}`, {
        method: 'DELETE',
      });
      setMessage(`Company ${id} deleted 🗑️`);
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
        <h3>Create Company</h3>
        <form className="crud-grid" onSubmit={handleCreate}>
          <div className="crud-field">
            <label htmlFor="company-create-id">Company ID (optional)</label>
            <input
              id="company-create-id"
              value={createDraft.id}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, id: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="company-create-name">Name</label>
            <input
              id="company-create-name"
              required
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, name: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="company-create-type">Type</label>
            <select
              id="company-create-type"
              value={createDraft.type}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, type: event.target.value }))
              }
            >
              <option value="supplier">supplier</option>
              <option value="manufacturer">manufacturer</option>
              <option value="distributor">distributor</option>
              <option value="retailer">retailer</option>
              <option value="customer">customer</option>
            </select>
          </div>
          <div className="crud-field">
            <label htmlFor="company-create-country">Country</label>
            <input
              id="company-create-country"
              required
              value={createDraft.country}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, country: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="company-create-coordinates">Coordinates (lat, lng)</label>
            <input
              id="company-create-coordinates"
              required
              value={createDraft.coordinates}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, coordinates: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="company-create-reliability">Reliability</label>
            <input
              id="company-create-reliability"
              type="number"
              step="0.01"
              min="0"
              max="1"
              required
              value={createDraft.reliability}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, reliability: event.target.value }))
              }
            />
          </div>
          <button type="submit" disabled={busyKey === 'create-company'}>
            {busyKey === 'create-company' ? 'Creating...' : 'Create Company'}
          </button>
        </form>
      </section>

      {editDraft && (
        <section className="card">
          <h3>Edit Company: {editDraft.id}</h3>
          <form className="crud-grid" onSubmit={handleUpdate}>
            <div className="crud-field">
              <label htmlFor="company-edit-name">Name</label>
              <input
                id="company-edit-name"
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
              <label htmlFor="company-edit-type">Type</label>
              <select
                id="company-edit-type"
                value={editDraft.type}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, type: event.target.value } : draft,
                  )
                }
              >
                <option value="supplier">supplier</option>
                <option value="manufacturer">manufacturer</option>
                <option value="distributor">distributor</option>
                <option value="retailer">retailer</option>
                <option value="customer">customer</option>
              </select>
            </div>
            <div className="crud-field">
              <label htmlFor="company-edit-country">Country</label>
              <input
                id="company-edit-country"
                required
                value={editDraft.country}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, country: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="company-edit-coordinates">Coordinates</label>
              <input
                id="company-edit-coordinates"
                required
                value={editDraft.coordinates}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, coordinates: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="crud-field">
              <label htmlFor="company-edit-reliability">Reliability</label>
              <input
                id="company-edit-reliability"
                type="number"
                step="0.01"
                min="0"
                max="1"
                required
                value={editDraft.reliability}
                onChange={(event) =>
                  setEditDraft((draft) =>
                    draft ? { ...draft, reliability: event.target.value } : draft,
                  )
                }
              />
            </div>
            <div className="inline-actions">
              <button
                type="submit"
                disabled={busyKey === `update-company-${editDraft.id}`}
              >
                {busyKey === `update-company-${editDraft.id}` ? 'Saving...' : 'Save Changes'}
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
              <th>Company</th>
              <th>Type</th>
              <th>Country</th>
              <th>Coordinates</th>
              <th>Reliability</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCompanies.map((company) => (
              <tr key={company.id}>
                <td>
                  <Link href={`/suppliers/${company.id}`}>
                    <strong>{company.name}</strong>
                  </Link>
                  <div className="small mono">{company.id}</div>
                </td>
                <td>
                  <span className="tag">{company.type}</span>
                </td>
                <td>{company.country}</td>
                <td className="mono">{company.coordinates}</td>
                <td>{company.reliability.toFixed(2)}</td>
                <td>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button-muted"
                      onClick={() => setEditDraft(toDraft(company))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      disabled={busyKey === `delete-company-${company.id}`}
                      onClick={() => handleDelete(company.id)}
                    >
                      {busyKey === `delete-company-${company.id}` ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedCompanies.length === 0 && (
              <tr>
                <td colSpan={6}>No companies matched these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="feedback">{message}</p>}
    </>
  );
}
