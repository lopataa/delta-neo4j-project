'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { BomEntry, Product } from '@/lib/types';

type CompositionVisualizerProps = {
  product: Product;
  productId: string;
  entries: BomEntry[];
};

type GraphNode = {
  key: string;
  pathKey: string | null;
  parentPathKey: string | null;
  parentId: string | null;
  id: string;
  name: string;
  criticality: string;
  depth: number;
  position: number;
  quantity: number;
  suppliers: BomEntry['suppliers'];
};

function buildGraphNodes(entries: BomEntry[], productId: string): GraphNode[] {
  const sorted = [...entries].sort((left, right) => {
    const depthDelta = (left.depth ?? 1) - (right.depth ?? 1);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    const positionDelta = left.position - right.position;
    if (positionDelta !== 0) {
      return positionDelta;
    }

    return left.component.name.localeCompare(right.component.name);
  });

  return sorted.map((entry, index) => {
    const pathKey = entry.pathKey ?? null;
    const depth = entry.depth ?? 1;
    const parentPathKey =
      pathKey && pathKey.lastIndexOf(':') > 0
        ? pathKey.slice(0, pathKey.lastIndexOf(':'))
        : null;

    return {
      key: pathKey ?? `${entry.parentId ?? productId}-${entry.component.id}-${index}`,
      pathKey,
      parentPathKey,
      parentId: entry.parentId ?? null,
      id: entry.component.id,
      name: entry.component.name,
      criticality: entry.component.criticality,
      depth,
      position: entry.position,
      quantity: entry.quantity,
      suppliers: entry.suppliers,
    };
  });
}

export function CompositionVisualizer({
  product,
  productId,
  entries,
}: CompositionVisualizerProps) {
  const [view, setView] = useState<'tree' | 'graph'>('tree');

  const graphNodes = useMemo(() => buildGraphNodes(entries, productId), [entries, productId]);

  const graphLayout = useMemo(() => {
    const byDepth = new Map<number, GraphNode[]>();
    graphNodes.forEach((node) => {
      const bucket = byDepth.get(node.depth) ?? [];
      bucket.push(node);
      byDepth.set(node.depth, bucket);
    });

    const depths = [...byDepth.keys()].sort((left, right) => left - right);
    depths.forEach((depth) => {
      byDepth.get(depth)?.sort((left, right) => {
        const positionDelta = left.position - right.position;
        if (positionDelta !== 0) {
          return positionDelta;
        }
        return left.name.localeCompare(right.name);
      });
    });

    const maxDepth = depths.at(-1) ?? 1;
    const maxCountAtDepth = Math.max(
      1,
      ...depths.map((depth) => byDepth.get(depth)?.length ?? 0),
    );

    const width = Math.max(880, (maxDepth + 2) * 220);
    const height = Math.max(320, maxCountAtDepth * 110 + 110);

    const rootPoint = {
      x: 90,
      y: height / 2,
    };

    const pointsByKey = new Map<string, { x: number; y: number }>();
    depths.forEach((depth) => {
      const nodesAtDepth = byDepth.get(depth) ?? [];
      const span = Math.max(1, nodesAtDepth.length);
      const segment = height / (span + 1);
      nodesAtDepth.forEach((node, index) => {
        pointsByKey.set(node.key, {
          x: 90 + depth * 220,
          y: segment * (index + 1),
        });
      });
    });

    const nodeByPath = new Map<string, GraphNode>();
    graphNodes.forEach((node) => {
      if (node.pathKey) {
        nodeByPath.set(node.pathKey, node);
      }
    });

    const edges = graphNodes
      .map((node) => {
        const to = pointsByKey.get(node.key);
        if (!to) {
          return null;
        }

        let from = rootPoint;
        if (node.depth > 1) {
          if (node.parentPathKey && nodeByPath.get(node.parentPathKey)) {
            const parent = nodeByPath.get(node.parentPathKey)!;
            from = pointsByKey.get(parent.key) ?? rootPoint;
          } else if (node.parentId) {
            const fallbackParent = graphNodes.find(
              (candidate) =>
                candidate.id === node.parentId && candidate.depth === node.depth - 1,
            );
            from = (fallbackParent && pointsByKey.get(fallbackParent.key)) ?? rootPoint;
          }
        }

        return {
          key: `${from.x}-${from.y}-${to.x}-${to.y}-${node.key}`,
          from,
          to,
          quantity: node.quantity,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null);

    return {
      width,
      height,
      rootPoint,
      pointsByKey,
      edges,
    };
  }, [graphNodes]);

  return (
    <div className="composition-graph">
      <div className="inline-actions">
        <button
          type="button"
          className={view === 'tree' ? 'button-muted is-active' : 'button-muted'}
          onClick={() => setView('tree')}
        >
          Tree View
        </button>
        <button
          type="button"
          className={view === 'graph' ? 'button-muted is-active' : 'button-muted'}
          onClick={() => setView('graph')}
        >
          Graph View
        </button>
      </div>

      {view === 'tree' && (
        <>
          <div className="composition-root">
            <p className="kpi-label">Product</p>
            <strong>{product.name}</strong>
            <div className="small mono">{product.id}</div>
          </div>

          <div className="composition-rows">
            {graphNodes.map((entry) => (
              <div
                className="composition-row"
                key={entry.key}
                style={{ marginLeft: `${Math.max(0, entry.depth - 1) * 4}rem` }}
              >
                <div className="composition-connector">
                  <span className="composition-qty mono">x{entry.quantity}</span>
                </div>

                <article className="composition-node">
                  <div className="composition-node-head">
                    <strong>{entry.name}</strong>
                    <span className={`tag status-${entry.criticality}`}>{entry.criticality}</span>
                  </div>

                  <div className="small mono">
                    {entry.id} · pos {entry.position} · level {entry.depth}
                  </div>

                  <div className="small">
                    SUPPLIED_BY:{' '}
                    {entry.suppliers.length === 0 && 'No supplier'}
                    {entry.suppliers.map((supplier, index) => (
                      <span key={supplier.id}>
                        {index > 0 && ', '}
                        <Link href={`/suppliers/${supplier.id}`}>{supplier.name}</Link>
                      </span>
                    ))}
                  </div>
                </article>
              </div>
            ))}

            {graphNodes.length === 0 && <p className="small">No BOM components available.</p>}
          </div>
        </>
      )}

      {view === 'graph' && (
        <div className="composition-canvas-wrap">
          <svg
            className="composition-canvas"
            viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
            role="img"
            aria-label="Component graph view"
          >
            <defs>
              <marker
                id="comp-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f97f3" />
              </marker>
            </defs>

            <rect width={graphLayout.width} height={graphLayout.height} fill="#f4fbff" />

            {graphLayout.edges.map((edge) => {
              const controlX = edge.from.x + (edge.to.x - edge.from.x) * 0.5;
              const path = `M ${edge.from.x} ${edge.from.y} C ${controlX} ${edge.from.y}, ${controlX} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;
              const labelX = edge.from.x + (edge.to.x - edge.from.x) * 0.5;
              const labelY = edge.from.y + (edge.to.y - edge.from.y) * 0.5 - 8;

              return (
                <g key={edge.key}>
                  <path className="composition-graph-edge" d={path} markerEnd="url(#comp-arrow)" />
                  <text className="composition-edge-label" x={labelX} y={labelY}>
                    x{edge.quantity}
                  </text>
                </g>
              );
            })}

            <g>
              <rect
                className="composition-graph-root"
                x={graphLayout.rootPoint.x - 62}
                y={graphLayout.rootPoint.y - 30}
                width={124}
                height={60}
                rx={8}
              />
              <text
                className="composition-graph-root-name"
                x={graphLayout.rootPoint.x}
                y={graphLayout.rootPoint.y - 4}
                textAnchor="middle"
              >
                {product.name}
              </text>
              <text
                className="composition-graph-root-id"
                x={graphLayout.rootPoint.x}
                y={graphLayout.rootPoint.y + 15}
                textAnchor="middle"
              >
                {product.id}
              </text>
            </g>

            {graphNodes.map((node) => {
              const point = graphLayout.pointsByKey.get(node.key);
              if (!point) {
                return null;
              }

              return (
                <g key={`node-${node.key}`}>
                  <rect
                    className={`composition-graph-node status-${node.criticality}`}
                    x={point.x - 72}
                    y={point.y - 26}
                    width={144}
                    height={52}
                    rx={8}
                  />
                  <text
                    className="composition-graph-node-name"
                    x={point.x}
                    y={point.y - 3}
                    textAnchor="middle"
                  >
                    {node.name}
                  </text>
                  <text
                    className="composition-graph-node-id"
                    x={point.x}
                    y={point.y + 13}
                    textAnchor="middle"
                  >
                    {node.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
