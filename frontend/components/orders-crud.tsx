'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { clientRequest } from '@/lib/client-api';
import type { Company, LocationNode, Order, Product, RouteNode } from '@/lib/types';

type OrderCreateDraft = {
  id: string;
  orderDate: string;
  dueDate: string;
  quantity: string;
  status: string;
  cost: string;
  fromCompanyId: string;
  placedWithCompanyId: string;
  routeId: string;
  productId: string;
  itemQuantity: string;
  itemUnitPrice: string;
};

type PlannerDraft = {
  routeId: string;
  routeName: string;
  distance: string;
  estimatedTime: string;
  cost: string;
  reliability: string;
  selectedLocationId: string;
  pathIds: string[];
};

type LocationDraft = {
  id: string;
  name: string;
  type: string;
  coordinates: string;
  capacity: string;
};

function today(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const [latRaw, lngRaw] = input.split(',').map((entry) => entry.trim());
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function formatPathLabel(pathIds: string[], locationById: Map<string, LocationNode>): string {
  return pathIds.map((id) => locationById.get(id)?.name ?? id).join(' → ');
}

const emptyLocationDraft: LocationDraft = {
  id: '',
  name: '',
  type: 'hub',
  coordinates: '0,0',
  capacity: '12000',
};

const emptyOrderDraft: OrderCreateDraft = {
  id: '',
  orderDate: today(0),
  dueDate: today(14),
  quantity: '1',
  status: 'pending',
  cost: '0',
  fromCompanyId: '',
  placedWithCompanyId: '',
  routeId: '',
  productId: '',
  itemQuantity: '1',
  itemUnitPrice: '0',
};

type OrdersCrudProps = {
  orders: Order[];
  products: Product[];
  companies: Company[];
  routeOptions: RouteNode[];
  locations: LocationNode[];
};

type RouteMapCanvasProps = {
  locations: LocationNode[];
  routes: RouteNode[];
  activePathIds: string[];
  highlightedRouteId: string;
};

function RouteMapCanvas({
  locations,
  routes,
  activePathIds,
  highlightedRouteId,
}: RouteMapCanvasProps) {
  const pointById = useMemo(() => {
    const width = 980;
    const height = 420;
    const pad = 50;

    const parsed = locations.map((location, index) => {
      const coords = parseCoordinates(location.coordinates);
      return {
        location,
        index,
        lat: coords?.lat ?? 40 + index * 3,
        lng: coords?.lng ?? -20 + index * 7,
      };
    });

    const lats = parsed.map((entry) => entry.lat);
    const lngs = parsed.map((entry) => entry.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = Math.max(0.0001, maxLat - minLat);
    const lngRange = Math.max(0.0001, maxLng - minLng);

    const pointMap = new Map<
      string,
      { x: number; y: number; name: string; type: string }
    >();
    parsed.forEach((entry) => {
      const x = pad + ((entry.lng - minLng) / lngRange) * (width - pad * 2);
      const y = pad + (1 - (entry.lat - minLat) / latRange) * (height - pad * 2);
      pointMap.set(entry.location.id, {
        x,
        y,
        name: entry.location.name,
        type: entry.location.type,
      });
    });

    return pointMap;
  }, [locations]);

  function buildSegments(pathIds: string[]) {
    const segments: Array<{
      fromId: string;
      toId: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }> = [];

    for (let index = 0; index < pathIds.length - 1; index += 1) {
      const fromId = pathIds[index];
      const toId = pathIds[index + 1];
      const fromPoint = pointById.get(fromId);
      const toPoint = pointById.get(toId);
      if (!fromPoint || !toPoint) {
        continue;
      }

      segments.push({
        fromId,
        toId,
        from: { x: fromPoint.x, y: fromPoint.y },
        to: { x: toPoint.x, y: toPoint.y },
      });
    }

    return segments;
  }

  const activeSegments = buildSegments(activePathIds);

  return (
    <div className="route-map-shell">
      <svg className="route-map" viewBox="0 0 980 420" role="img" aria-label="Route map">
        <defs>
          <marker
            id="route-arrow-light"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7fb3de" />
          </marker>
          <marker
            id="route-arrow-strong"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0b76d2" />
          </marker>
        </defs>

        <rect x={0} y={0} width={980} height={420} fill="#f4fbff" />

        {routes.flatMap((route) => {
          const pathIds = route.locationIds ?? [];
          const routeSegments = buildSegments(pathIds);
          return routeSegments.map((segment, index) => (
            <line
              key={`route-${route.id}-${segment.fromId}-${segment.toId}-${index}`}
              x1={segment.from.x}
              y1={segment.from.y}
              x2={segment.to.x}
              y2={segment.to.y}
              className={
                route.id === highlightedRouteId ? 'route-edge route-edge-selected' : 'route-edge'
              }
              markerEnd="url(#route-arrow-light)"
            />
          ));
        })}

        {activeSegments.map((segment, index) => (
          <line
            key={`active-${segment.fromId}-${segment.toId}-${index}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            className="route-edge-active"
            markerEnd="url(#route-arrow-strong)"
          />
        ))}

        {[...pointById.entries()].map(([id, point]) => (
          <g key={id}>
            <circle className="route-node-dot" cx={point.x} cy={point.y} r={8} />
            <text className="route-node-label" x={point.x + 11} y={point.y - 6}>
              {point.name}
            </text>
            <text className="route-node-sub" x={point.x + 11} y={point.y + 9}>
              {id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function OrdersCrud({
  orders,
  products,
  companies,
  routeOptions,
  locations,
}: OrdersCrudProps) {
  const router = useRouter();
  const [routeCatalog, setRouteCatalog] = useState<RouteNode[]>(() => routeOptions);
  const [locationCatalog, setLocationCatalog] = useState<LocationNode[]>(() => locations);
  const [createDraft, setCreateDraft] = useState<OrderCreateDraft>(() => {
    const defaultFrom = companies.find((company) => company.type === 'customer')?.id ?? '';
    const defaultPlaced =
      companies.find((company) => company.type === 'manufacturer')?.id ??
      companies.find((company) => company.type === 'supplier')?.id ??
      '';
    const defaultProduct = products[0]?.id ?? '';
    const defaultRoute = routeOptions[0]?.id ?? '';

    return {
      ...emptyOrderDraft,
      fromCompanyId: defaultFrom,
      placedWithCompanyId: defaultPlaced,
      productId: defaultProduct,
      routeId: defaultRoute,
      itemUnitPrice: products[0] ? String(products[0].price) : '0',
    };
  });

  const [plannerDraft, setPlannerDraft] = useState<PlannerDraft>(() => {
    const firstRoute = routeOptions[0];
    const fallbackPath = locationCatalog.slice(0, 2).map((location) => location.id);
    const initialPath =
      firstRoute?.locationIds && firstRoute.locationIds.length >= 2
        ? firstRoute.locationIds
        : fallbackPath;

    return {
      routeId: '',
      routeName: '',
      distance: firstRoute ? String(firstRoute.distance) : '1000',
      estimatedTime: firstRoute ? String(firstRoute.estimatedTime) : '3',
      cost: firstRoute ? String(firstRoute.cost) : '1200',
      reliability: firstRoute ? String(firstRoute.reliability) : '0.9',
      selectedLocationId: locationCatalog[0]?.id ?? '',
      pathIds: initialPath,
    };
  });
  const [editingRouteId, setEditingRouteId] = useState(routeOptions[0]?.id ?? '');

  const [locationDraft, setLocationDraft] = useState<LocationDraft>(emptyLocationDraft);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');

  const locationById = useMemo(() => {
    return new Map(locationCatalog.map((location) => [location.id, location]));
  }, [locationCatalog]);

  const sortedOrders = useMemo(
    () => [...orders].sort((left, right) => right.orderDate.localeCompare(left.orderDate)),
    [orders],
  );

  const selectedPathLabel = plannerDraft.pathIds
    .map((id) => locationById.get(id)?.name ?? id)
    .join(' → ');

  const sortedRoutes = useMemo(
    () => [...routeCatalog].sort((left, right) => left.name.localeCompare(right.name)),
    [routeCatalog],
  );

  const editingRoute = useMemo(
    () => sortedRoutes.find((route) => route.id === editingRouteId) ?? null,
    [sortedRoutes, editingRouteId],
  );

  function loadRouteIntoEditor(routeId: string) {
    if (!routeId) {
      return;
    }

    const selectedRoute = routeCatalog.find((route) => route.id === routeId);
    if (!selectedRoute) {
      return;
    }

    const fallbackPath = locationCatalog.slice(0, 2).map((location) => location.id);
    const pathIds =
      selectedRoute.locationIds && selectedRoute.locationIds.length >= 2
        ? selectedRoute.locationIds
        : fallbackPath;

    setPlannerDraft((draft) => ({
      ...draft,
      routeId: selectedRoute.id,
      routeName: selectedRoute.name,
      distance: String(selectedRoute.distance ?? 0),
      estimatedTime: String(selectedRoute.estimatedTime ?? 0),
      cost: String(selectedRoute.cost ?? 0),
      reliability: String(selectedRoute.reliability ?? 0.9),
      pathIds,
      selectedLocationId: pathIds[0] ?? draft.selectedLocationId,
    }));
  }

  function selectRouteForEditing(routeId: string) {
    setEditingRouteId(routeId);
    if (!routeId) {
      return;
    }
    loadRouteIntoEditor(routeId);
  }

  async function handleCreateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey('create-location');
    setMessage('');

    try {
      const created = await clientRequest<LocationNode>('/locations', {
        method: 'POST',
        body: JSON.stringify({
          id: locationDraft.id || undefined,
          name: locationDraft.name,
          type: locationDraft.type,
          coordinates: locationDraft.coordinates,
          capacity: toNumber(locationDraft.capacity, 12000),
        }),
      });

      setLocationCatalog((current) => {
        const filtered = current.filter((location) => location.id !== created.id);
        return [...filtered, created].sort((left, right) => left.name.localeCompare(right.name));
      });

      setPlannerDraft((draft) => ({
        ...draft,
        selectedLocationId: created.id,
      }));
      setLocationDraft(emptyLocationDraft);
      setMessage(`Hub ${created.name} added ✅`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Hub creation failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleCreateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plannerDraft.pathIds.length < 2) {
      setMessage('Route path needs at least 2 hubs.');
      return;
    }

    setBusyKey('create-route');
    setMessage('');

    try {
      const created = await clientRequest<RouteNode>('/routes', {
        method: 'POST',
        body: JSON.stringify({
          id: plannerDraft.routeId || undefined,
          name: plannerDraft.routeName || undefined,
          distance: toNumber(plannerDraft.distance, 0),
          estimatedTime: toNumber(plannerDraft.estimatedTime, 0),
          cost: toNumber(plannerDraft.cost, 0),
          reliability: toNumber(plannerDraft.reliability, 0.9),
          locationIds: plannerDraft.pathIds,
        }),
      });

      setRouteCatalog((current) => {
        const filtered = current.filter((route) => route.id !== created.id);
        return [...filtered, created].sort((left, right) => left.name.localeCompare(right.name));
      });

      setCreateDraft((draft) => ({
        ...draft,
        routeId: created.id,
      }));

      setPlannerDraft((draft) => ({
        ...draft,
        routeId: created.id,
      }));
      setEditingRouteId(created.id);

      setMessage(`Route ${created.name} created ✅`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Route creation failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleUpdateRoute() {
    if (!editingRouteId) {
      setMessage('Select a route to update.');
      return;
    }

    if (plannerDraft.pathIds.length < 2) {
      setMessage('Route path needs at least 2 hubs.');
      return;
    }

    setBusyKey('update-route');
    setMessage('');

    try {
      const updated = await clientRequest<RouteNode>(`/routes/${editingRouteId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: plannerDraft.routeName || undefined,
          distance: toNumber(plannerDraft.distance, 0),
          estimatedTime: toNumber(plannerDraft.estimatedTime, 0),
          cost: toNumber(plannerDraft.cost, 0),
          reliability: toNumber(plannerDraft.reliability, 0.9),
          locationIds: plannerDraft.pathIds,
        }),
      });

      setRouteCatalog((current) => {
        const filtered = current.filter((route) => route.id !== updated.id);
        return [...filtered, updated].sort((left, right) => left.name.localeCompare(right.name));
      });
      setCreateDraft((draft) => ({
        ...draft,
        routeId: updated.id,
      }));
      setMessage(`Route ${updated.name} updated ✅`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Route update failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeleteRoute() {
    if (!editingRouteId) {
      setMessage('Select a route to delete.');
      return;
    }

    const confirmed = window.confirm(`Delete route ${editingRouteId}?`);
    if (!confirmed) {
      return;
    }

    setBusyKey('delete-route');
    setMessage('');

    try {
      await clientRequest(`/routes/${editingRouteId}`, {
        method: 'DELETE',
      });

      const remainingRoutes = routeCatalog.filter((route) => route.id !== editingRouteId);
      const nextEditingRouteId = remainingRoutes[0]?.id ?? '';
      setRouteCatalog(remainingRoutes);
      setEditingRouteId(nextEditingRouteId);

      if (nextEditingRouteId) {
        loadRouteIntoEditor(nextEditingRouteId);
      } else {
        setPlannerDraft((draft) => ({
          ...draft,
          routeId: '',
          routeName: '',
          pathIds: [],
        }));
      }

      setCreateDraft((draft) => ({
        ...draft,
        routeId:
          draft.routeId === editingRouteId ? (remainingRoutes[0]?.id ?? '') : draft.routeId,
      }));

      setMessage(`Route ${editingRouteId} deleted 🗑️`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Route delete failed');
    } finally {
      setBusyKey('');
    }
  }

  function addHubToPath() {
    if (!plannerDraft.selectedLocationId) {
      return;
    }

    setPlannerDraft((draft) => ({
      ...draft,
      pathIds: [...draft.pathIds, draft.selectedLocationId],
    }));
  }

  function removeLastHubFromPath() {
    setPlannerDraft((draft) => ({
      ...draft,
      pathIds: draft.pathIds.slice(0, -1),
    }));
  }

  function removeHubAtIndex(removeIndex: number) {
    setPlannerDraft((draft) => ({
      ...draft,
      pathIds: draft.pathIds.filter((_, index) => index !== removeIndex),
    }));
  }

  function clearPath() {
    setPlannerDraft((draft) => ({
      ...draft,
      pathIds: [],
    }));
  }

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey('create-order');
    setMessage('');

    try {
      await clientRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          id: createDraft.id || undefined,
          orderDate: createDraft.orderDate,
          dueDate: createDraft.dueDate,
          quantity: toNumber(createDraft.quantity, 1),
          status: createDraft.status,
          cost: toNumber(createDraft.cost, 0),
          fromCompanyId: createDraft.fromCompanyId || undefined,
          placedWithCompanyId: createDraft.placedWithCompanyId || undefined,
          routeId: createDraft.routeId || undefined,
          items: createDraft.productId
            ? [
                {
                  productId: createDraft.productId,
                  quantity: toNumber(createDraft.itemQuantity, 1),
                  unitPrice: toNumber(createDraft.itemUnitPrice, 0),
                },
              ]
            : [],
        }),
      });

      setCreateDraft((draft) => ({
        ...draft,
        id: '',
        quantity: '1',
        cost: '0',
      }));
      setMessage('Order created ✅');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Create failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleStatusUpdate(orderId: string) {
    const status = statusDrafts[orderId] ?? 'pending';
    setBusyKey(`status-${orderId}`);
    setMessage('');

    try {
      await clientRequest(`/orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setMessage(`Order ${orderId} status updated ✅`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Status update failed');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDelete(orderId: string) {
    const confirmed = window.confirm(`Delete order ${orderId}?`);
    if (!confirmed) {
      return;
    }

    setBusyKey(`delete-${orderId}`);
    setMessage('');

    try {
      await clientRequest(`/orders/${orderId}`, {
        method: 'DELETE',
      });
      setMessage(`Order ${orderId} deleted 🗑️`);
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
        <h3>Supply Path Editor</h3>
        <p className="small" style={{ marginBottom: '0.6rem' }}>
          Build routes, manage hubs in the path, and switch to existing routes for quick edits.
        </p>

        <div className="route-candidate-metrics route-editor-kpis">
          <span className="route-candidate-metric">
            Routes <strong>{sortedRoutes.length}</strong>
          </span>
          <span className="route-candidate-metric">
            Hubs <strong>{locationCatalog.length}</strong>
          </span>
          <span className="route-candidate-metric">
            Selected Path Hubs <strong>{plannerDraft.pathIds.length}</strong>
          </span>
          <span className="route-candidate-metric">
            Active Route <strong>{editingRoute?.name ?? 'New route'}</strong>
          </span>
        </div>

        <form className="crud-grid" onSubmit={handleCreateRoute}>
          <p className="crud-section-label crud-span-full">Select Route</p>
          <div className="crud-field">
            <label htmlFor="planner-edit-route">Edit Existing Route</label>
            <select
              id="planner-edit-route"
              value={editingRouteId}
              onChange={(event) => selectRouteForEditing(event.target.value)}
            >
              <option value="">Select route</option>
              {sortedRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} ({route.id})
                </option>
              ))}
            </select>
          </div>
          <div className="crud-field">
            <label htmlFor="planner-route-id">Route ID (optional)</label>
            <input
              id="planner-route-id"
              value={plannerDraft.routeId}
              onChange={(event) =>
                setPlannerDraft((draft) => ({ ...draft, routeId: event.target.value }))
              }
            />
          </div>
          <div className="inline-actions crud-span-full">
            <button
              type="button"
              className="button-muted"
              onClick={() => loadRouteIntoEditor(editingRouteId)}
              disabled={!editingRouteId}
            >
              Reload From Saved
            </button>
            <button
              type="button"
              className="button-muted"
              onClick={handleUpdateRoute}
              disabled={!editingRouteId || busyKey === 'update-route'}
            >
              {busyKey === 'update-route' ? 'Updating...' : 'Update Route'}
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDeleteRoute}
              disabled={!editingRouteId || busyKey === 'delete-route'}
            >
              {busyKey === 'delete-route' ? 'Deleting...' : 'Delete Route'}
            </button>
          </div>

          <p className="crud-section-label crud-span-full">Route Details</p>
          <div className="crud-field">
            <label htmlFor="planner-route-name">Route Name</label>
            <input
              id="planner-route-name"
              value={plannerDraft.routeName}
              onChange={(event) =>
                setPlannerDraft((draft) => ({ ...draft, routeName: event.target.value }))
              }
              placeholder="e.g. Custom Atlantic Loop"
            />
          </div>
          <div className="crud-field">
            <label htmlFor="planner-route-distance">Distance (km)</label>
            <input
              id="planner-route-distance"
              type="number"
              step="0.01"
              value={plannerDraft.distance}
              onChange={(event) =>
                setPlannerDraft((draft) => ({ ...draft, distance: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="planner-route-time">Estimated Time (days)</label>
            <input
              id="planner-route-time"
              type="number"
              step="0.01"
              value={plannerDraft.estimatedTime}
              onChange={(event) =>
                setPlannerDraft((draft) => ({ ...draft, estimatedTime: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="planner-route-cost">Cost</label>
            <input
              id="planner-route-cost"
              type="number"
              step="0.01"
              value={plannerDraft.cost}
              onChange={(event) =>
                setPlannerDraft((draft) => ({ ...draft, cost: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="planner-route-reliability">Reliability (0..1)</label>
            <input
              id="planner-route-reliability"
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={plannerDraft.reliability}
              onChange={(event) =>
                setPlannerDraft((draft) => ({ ...draft, reliability: event.target.value }))
              }
            />
          </div>

          <p className="crud-section-label crud-span-full">Path Builder</p>
          <div className="crud-field">
            <label htmlFor="planner-select-hub">Hub / Node</label>
            <select
              id="planner-select-hub"
              value={plannerDraft.selectedLocationId}
              onChange={(event) =>
                setPlannerDraft((draft) => ({
                  ...draft,
                  selectedLocationId: event.target.value,
                }))
              }
            >
              <option value="">Select hub</option>
              {locationCatalog.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-actions crud-span-full">
            <button type="button" className="button-muted" onClick={addHubToPath}>
              Add Hub
            </button>
            <button type="button" className="button-muted" onClick={removeLastHubFromPath}>
              Undo Last Hub
            </button>
            <button type="button" className="button-muted" onClick={clearPath}>
              Clear Path
            </button>
          </div>

          <div className="crud-span-full route-path-preview">
            {plannerDraft.pathIds.length === 0 && <p className="small">No hubs selected yet.</p>}
            {plannerDraft.pathIds.map((id, index) => (
              <span className="route-path-chip" key={`path-chip-${id}-${index}`}>
                <span className="route-path-chip-order">#{index + 1}</span>
                <span>{locationById.get(id)?.name ?? id}</span>
                <button
                  type="button"
                  className="route-path-chip-remove"
                  onClick={() => removeHubAtIndex(index)}
                  aria-label={`Remove hub ${locationById.get(id)?.name ?? id} from path`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <button type="submit" disabled={busyKey === 'create-route'}>
            {busyKey === 'create-route' ? 'Saving Route...' : 'Save Planned Route'}
          </button>
        </form>

        <p className="small" style={{ marginTop: '0.6rem' }}>
          Path: {selectedPathLabel || 'No hubs selected'}
        </p>

        <RouteMapCanvas
          locations={locationCatalog}
          routes={routeCatalog}
          activePathIds={plannerDraft.pathIds}
          highlightedRouteId={editingRouteId || createDraft.routeId}
        />

        <div className="route-editor-catalog">
          <h4>Route Catalog</h4>
          <div className="route-candidate-list">
            {sortedRoutes.map((route) => {
              const pathLabel = route.locationIds?.length
                ? formatPathLabel(route.locationIds, locationById)
                : 'No hubs linked yet';

              return (
                <article
                  key={`route-card-${route.id}`}
                  className={`route-candidate-card ${route.id === editingRouteId ? 'route-candidate-card-featured' : ''}`}
                >
                  <header className="route-candidate-card-head">
                    <div>
                      <p className="route-candidate-title">{route.name}</p>
                      <p className="route-candidate-subtitle mono">{route.id}</p>
                    </div>
                    {route.id === editingRouteId && (
                      <span className="route-candidate-badge">Editing</span>
                    )}
                  </header>

                  <div className="route-candidate-metrics">
                    <span className="route-candidate-metric">
                      Distance <strong>{route.distance} km</strong>
                    </span>
                    <span className="route-candidate-metric">
                      Time <strong>{route.estimatedTime} d</strong>
                    </span>
                    <span className="route-candidate-metric">
                      Cost <strong>${route.cost}</strong>
                    </span>
                    <span className="route-candidate-metric">
                      Reliability <strong>{route.reliability}</strong>
                    </span>
                  </div>

                  <p className="small">Path: {pathLabel}</p>
                  <div className="inline-actions" style={{ marginTop: '0.45rem' }}>
                    <button
                      type="button"
                      className="button-muted"
                      onClick={() => selectRouteForEditing(route.id)}
                    >
                      Edit This Route
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Add Hub / Node</h3>
        <form className="crud-grid" onSubmit={handleCreateLocation}>
          <div className="crud-field">
            <label htmlFor="hub-create-id">Hub ID (optional)</label>
            <input
              id="hub-create-id"
              value={locationDraft.id}
              onChange={(event) =>
                setLocationDraft((draft) => ({ ...draft, id: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="hub-create-name">Hub Name</label>
            <input
              id="hub-create-name"
              required
              value={locationDraft.name}
              onChange={(event) =>
                setLocationDraft((draft) => ({ ...draft, name: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="hub-create-type">Type</label>
            <select
              id="hub-create-type"
              value={locationDraft.type}
              onChange={(event) =>
                setLocationDraft((draft) => ({ ...draft, type: event.target.value }))
              }
            >
              <option value="hub">hub</option>
              <option value="warehouse">warehouse</option>
              <option value="port">port</option>
              <option value="distribution_center">distribution_center</option>
              <option value="factory">factory</option>
              <option value="transit_node">transit_node</option>
            </select>
          </div>
          <div className="crud-field">
            <label htmlFor="hub-create-coordinates">Coordinates (lat,lng)</label>
            <input
              id="hub-create-coordinates"
              value={locationDraft.coordinates}
              onChange={(event) =>
                setLocationDraft((draft) => ({ ...draft, coordinates: event.target.value }))
              }
              placeholder="e.g. 40.7128,-74.0060"
            />
          </div>
          <div className="crud-field">
            <label htmlFor="hub-create-capacity">Capacity</label>
            <input
              id="hub-create-capacity"
              type="number"
              value={locationDraft.capacity}
              onChange={(event) =>
                setLocationDraft((draft) => ({ ...draft, capacity: event.target.value }))
              }
            />
          </div>
          <button type="submit" disabled={busyKey === 'create-location'}>
            {busyKey === 'create-location' ? 'Adding Hub...' : 'Add Hub / Node'}
          </button>
        </form>
      </section>

      <section className="card">
        <h3>Create Order</h3>
        <form className="crud-grid" onSubmit={handleCreateOrder}>
          <div className="crud-field">
            <label htmlFor="order-create-id">Order ID (optional)</label>
            <input
              id="order-create-id"
              value={createDraft.id}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, id: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="order-create-order-date">Order Date</label>
            <input
              id="order-create-order-date"
              type="date"
              value={createDraft.orderDate}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, orderDate: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="order-create-due-date">Due Date</label>
            <input
              id="order-create-due-date"
              type="date"
              value={createDraft.dueDate}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, dueDate: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="order-create-quantity">Order Quantity</label>
            <input
              id="order-create-quantity"
              type="number"
              value={createDraft.quantity}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, quantity: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="order-create-cost">Total Cost</label>
            <input
              id="order-create-cost"
              type="number"
              step="0.01"
              value={createDraft.cost}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, cost: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="order-create-status">Status</label>
            <select
              id="order-create-status"
              value={createDraft.status}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, status: event.target.value }))
              }
            >
              <option value="pending">pending</option>
              <option value="in_transit">in_transit</option>
              <option value="delivered">delivered</option>
              <option value="delayed">delayed</option>
            </select>
          </div>

          <div className="crud-field">
            <label htmlFor="order-create-from-company">From Company</label>
            <select
              id="order-create-from-company"
              value={createDraft.fromCompanyId}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, fromCompanyId: event.target.value }))
              }
            >
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={`from-${company.id}`} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="crud-field">
            <label htmlFor="order-create-placed-with">Placed With</label>
            <select
              id="order-create-placed-with"
              value={createDraft.placedWithCompanyId}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  placedWithCompanyId: event.target.value,
                }))
              }
            >
              <option value="">Select supplier/manufacturer</option>
              {companies.map((company) => (
                <option key={`placed-${company.id}`} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="crud-field">
            <label htmlFor="order-create-route">Route</label>
            <select
              id="order-create-route"
              value={createDraft.routeId}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, routeId: event.target.value }))
              }
            >
              <option value="">Select route</option>
              {routeCatalog.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} ({route.id})
                </option>
              ))}
            </select>
          </div>

          <div className="crud-field">
            <label htmlFor="order-create-product">Product Line</label>
            <select
              id="order-create-product"
              value={createDraft.productId}
              onChange={(event) => {
                const selectedProduct = products.find(
                  (product) => product.id === event.target.value,
                );
                setCreateDraft((draft) => ({
                  ...draft,
                  productId: event.target.value,
                  itemUnitPrice: selectedProduct
                    ? String(selectedProduct.price)
                    : draft.itemUnitPrice,
                }));
              }}
            >
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div className="crud-field">
            <label htmlFor="order-create-item-quantity">Item Quantity</label>
            <input
              id="order-create-item-quantity"
              type="number"
              value={createDraft.itemQuantity}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, itemQuantity: event.target.value }))
              }
            />
          </div>
          <div className="crud-field">
            <label htmlFor="order-create-item-unit-price">Item Unit Price</label>
            <input
              id="order-create-item-unit-price"
              type="number"
              step="0.01"
              value={createDraft.itemUnitPrice}
              onChange={(event) =>
                setCreateDraft((draft) => ({ ...draft, itemUnitPrice: event.target.value }))
              }
            />
          </div>

          <button type="submit" disabled={busyKey === 'create-order'}>
            {busyKey === 'create-order' ? 'Creating...' : 'Create Order'}
          </button>
        </form>
      </section>

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
              <th>Update Status</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.map((order) => (
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
                  <div className="inline-actions">
                    <div className="inline-field">
                      <label htmlFor={`order-status-${order.id}`}>Status</label>
                      <select
                        id={`order-status-${order.id}`}
                        value={statusDrafts[order.id] ?? order.status}
                        onChange={(event) =>
                          setStatusDrafts((drafts) => ({
                            ...drafts,
                            [order.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="pending">pending</option>
                        <option value="in_transit">in_transit</option>
                        <option value="delivered">delivered</option>
                        <option value="delayed">delayed</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="button-muted"
                      disabled={busyKey === `status-${order.id}`}
                      onClick={() => handleStatusUpdate(order.id)}
                    >
                      {busyKey === `status-${order.id}` ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="button-danger"
                    disabled={busyKey === `delete-${order.id}`}
                    onClick={() => handleDelete(order.id)}
                  >
                    {busyKey === `delete-${order.id}` ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
            {sortedOrders.length === 0 && (
              <tr>
                <td colSpan={8}>No orders in this view.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="feedback">{message}</p>}
    </>
  );
}
