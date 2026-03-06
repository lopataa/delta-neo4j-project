'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type RouteLocation = {
  id: string;
  name: string;
  coordinates?: string;
  type?: string;
};

type RouteCandidate = {
  route: RouteLocation[];
  distance: number;
  time: number;
  cost: number;
  reliability: number;
};

type CandidatePoint = {
  id: string;
  name: string;
  type?: string;
  lat: number;
  lng: number;
};

type CandidateLine = {
  key: string;
  rank: number;
  color: string;
  points: CandidatePoint[];
  distance: number;
  time: number;
  cost: number;
  reliability: number;
};

type LeafletMapInstance = {
  remove: () => void;
  fitBounds: (bounds: unknown, options?: { animate?: boolean }) => void;
  setView: (center: [number, number], zoom: number) => void;
};

type LeafletLayerInstance = {
  addTo: (map: LeafletMapInstance) => LeafletLayerInstance;
  bindTooltip: (
    content: string,
    options?: { sticky?: boolean; direction?: 'top' | 'right' | 'bottom' | 'left'; offset?: [number, number] },
  ) => LeafletLayerInstance;
};

type LeafletBoundsInstance = {
  pad: (ratio: number) => unknown;
};

type LeafletRuntime = {
  map: (
    element: HTMLElement,
    options?: {
      preferCanvas?: boolean;
      zoomControl?: boolean;
    },
  ) => LeafletMapInstance;
  tileLayer: (
    template: string,
    options?: {
      attribution?: string;
      maxZoom?: number;
    },
  ) => LeafletLayerInstance;
  polyline: (
    latLngs: [number, number][],
    options?: {
      color?: string;
      weight?: number;
      opacity?: number;
      dashArray?: string;
    },
  ) => LeafletLayerInstance;
  circleMarker: (
    center: [number, number],
    options?: {
      radius?: number;
      color?: string;
      weight?: number;
      fillColor?: string;
      fillOpacity?: number;
    },
  ) => LeafletLayerInstance;
  latLngBounds: (latLngs: [number, number][]) => LeafletBoundsInstance;
};

declare global {
  interface Window {
    L?: LeafletRuntime;
  }
}

const LEAFLET_SCRIPT_ID = 'orders-leaflet-script';
const LEAFLET_STYLE_ID = 'orders-leaflet-style';
const LEAFLET_SCRIPT_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_STYLE_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const ROUTE_COLORS = [
  '#0b76d2',
  '#16a085',
  '#c96e12',
  '#8a6cff',
  '#d9415a',
  '#3558c7',
];

function parseCoordinates(input: string | undefined): { lat: number; lng: number } | null {
  if (!input) {
    return null;
  }

  const [latRaw, lngRaw] = input.split(',').map((entry) => entry.trim());
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function ensureLeafletAssets(): Promise<LeafletRuntime> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet can only load in the browser'));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  const existingStyle = document.getElementById(LEAFLET_STYLE_ID) as HTMLLinkElement | null;
  if (!existingStyle) {
    const style = document.createElement('link');
    style.id = LEAFLET_STYLE_ID;
    style.rel = 'stylesheet';
    style.href = LEAFLET_STYLE_SRC;
    document.head.appendChild(style);
  }

  return new Promise<LeafletRuntime>((resolve, reject) => {
    const existingScript = document.getElementById(
      LEAFLET_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if (window.L) {
        resolve(window.L);
        return;
      }

      existingScript.addEventListener(
        'load',
        () => {
          if (window.L) {
            resolve(window.L);
            return;
          }
          reject(new Error('Leaflet loaded but window.L is unavailable'));
        },
        { once: true },
      );
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Leaflet script')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = LEAFLET_SCRIPT_ID;
    script.src = LEAFLET_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.L) {
        resolve(window.L);
        return;
      }
      reject(new Error('Leaflet loaded but window.L is unavailable'));
    };
    script.onerror = () => reject(new Error('Failed to load Leaflet script'));
    document.head.appendChild(script);
  });
}

export function OrdersCandidateMap({ routes }: { routes: RouteCandidate[] }) {
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const [loadError, setLoadError] = useState<string>('');

  const candidateLines = useMemo<CandidateLine[]>(() => {
    const lines: CandidateLine[] = [];

    routes.forEach((route, index) => {
      const points: CandidatePoint[] = [];

      route.route.forEach((location) => {
        const coordinates = parseCoordinates(location.coordinates);
        if (!coordinates) {
          return;
        }

        points.push({
          id: location.id,
          name: location.name,
          type: location.type,
          lat: coordinates.lat,
          lng: coordinates.lng,
        });
      });

      if (points.length < 2) {
        return;
      }

      lines.push({
        key: `${index}-${points.map((point) => point.id).join('>')}`,
        rank: index + 1,
        color: ROUTE_COLORS[index % ROUTE_COLORS.length],
        points,
        distance: route.distance,
        time: route.time,
        cost: route.cost,
        reliability: route.reliability,
      });
    });

    return lines;
  }, [routes]);

  const uniquePoints = useMemo(() => {
    const map = new Map<string, CandidatePoint>();
    candidateLines.forEach((line) => {
      line.points.forEach((point) => {
        if (!map.has(point.id)) {
          map.set(point.id, point);
        }
      });
    });
    return Array.from(map.values());
  }, [candidateLines]);

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!mapRootRef.current) {
        return;
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      if (candidateLines.length === 0) {
        return;
      }

      try {
        const L = await ensureLeafletAssets();
        if (cancelled || !mapRootRef.current) {
          return;
        }

        const map = L.map(mapRootRef.current, {
          preferCanvas: true,
          zoomControl: true,
        });

        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const allLatLngs: [number, number][] = [];

        candidateLines.forEach((line, index) => {
          const latLngs = line.points.map((point) => [point.lat, point.lng] as [number, number]);
          latLngs.forEach((value) => allLatLngs.push(value));

          const polyline = L.polyline(latLngs, {
            color: line.color,
            weight: index === 0 ? 5 : 4,
            opacity: index === 0 ? 0.95 : 0.72,
            dashArray: index === 0 ? undefined : '10 6',
          });

          polyline
            .bindTooltip(
              `Candidate ${line.rank}: ${line.distance} km · ${line.time} d · $${line.cost} · rel ${line.reliability}`,
              {
                sticky: true,
              },
            )
            .addTo(map);
        });

        uniquePoints.forEach((point) => {
          L.circleMarker([point.lat, point.lng], {
            radius: 6,
            color: '#132036',
            weight: 2,
            fillColor: '#ffffff',
            fillOpacity: 0.96,
          })
            .bindTooltip(`${point.name} (${point.id})`, {
              direction: 'top',
              offset: [0, -4],
            })
            .addTo(map);
        });

        if (allLatLngs.length > 0) {
          const bounds = L.latLngBounds(allLatLngs);
          map.fitBounds(bounds.pad(0.2), { animate: false });
        } else {
          map.setView([25, 5], 2);
        }

        setLoadError('');
      } catch {
        if (!cancelled) {
          setLoadError('Leaflet map could not be loaded in this environment.');
        }
      }
    }

    renderMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [candidateLines, uniquePoints]);

  if (routes.length === 0) {
    return <p>No route candidates for current path.</p>;
  }

  const skippedCount = Math.max(0, routes.length - candidateLines.length);

  return (
    <>
      <div className="route-map-shell route-map-shell-leaflet">
        <div className="route-map-leaflet-canvas" ref={mapRootRef} />
      </div>

      <div className="route-candidate-legend">
        {candidateLines.map((line) => (
          <div key={line.key} className="route-candidate-legend-item">
            <div className="route-candidate-legend-title">
              <span
                className="route-candidate-swatch"
                style={{ backgroundColor: line.color }}
                aria-hidden="true"
              />
              <span>Candidate {line.rank}</span>
            </div>
            <span className="small">
              {line.points.length} hubs · {line.distance} km · {line.time} d · ${line.cost} · rel{' '}
              {line.reliability}
            </span>
          </div>
        ))}
      </div>

      {skippedCount > 0 && (
        <p className="small" style={{ marginTop: '0.45rem' }}>
          {skippedCount} candidate route(s) hidden because one or more hubs are missing coordinates.
        </p>
      )}
      {loadError && (
        <p className="small" style={{ marginTop: '0.45rem' }}>
          {loadError}
        </p>
      )}
    </>
  );
}
