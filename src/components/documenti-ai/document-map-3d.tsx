"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";
import {
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";

export type DocumentMapNode = {
  id: string;
  title: string;
  category: string;
  chunkCount: number;
  status: string;
  documentDate: string | null;
  expiryDate: string | null;
};

export type DocumentMapLink = {
  source: string;
  target: string;
  score: number;
};

export type DocumentMapGraph = {
  nodes: DocumentMapNode[];
  links: DocumentMapLink[];
};

function hashColor(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 68% 52%)`;
}

export function categoryColor(category: string, status: string): string {
  if (status === "FAILED") return "#ef4444";
  if (status === "INDEXING" || status === "PENDING") return "#f59e0b";
  return hashColor(category);
}

function documentNodeMesh(node: DocumentMapNode): Mesh {
  const radius = Math.max(2, Math.min(9, Math.sqrt(node.chunkCount + 1) * 1.6));
  const color = categoryColor(node.category, node.status);
  const material = new MeshStandardMaterial({
    color,
    emissive:
      node.status === "FAILED"
        ? "#7f1d1d"
        : node.status === "INDEXING" || node.status === "PENDING"
          ? "#78350f"
          : "#000000",
    emissiveIntensity: node.status === "READY" ? 0 : 0.8,
    roughness: 0.42,
    metalness: 0.12,
  });
  return new Mesh(new SphereGeometry(radius, 16, 12), material);
}

function linkNodeId(value: string | NodeObject<DocumentMapNode> | undefined) {
  return typeof value === "object" ? String(value.id) : String(value ?? "");
}

function neighborSummary(
  nodeId: string,
  links: Array<LinkObject<DocumentMapNode, DocumentMapLink>>
): string {
  const related = links.filter(
    (link) =>
      linkNodeId(link.source) === nodeId ||
      linkNodeId(link.target) === nodeId
  );
  if (related.length === 0) return "Nessuna relazione sopra soglia";
  const average =
    related.reduce((sum, link) => sum + Number(link.score ?? 0), 0) /
    related.length;
  return `${related.length} relazioni · similarità media ${average.toFixed(2)}`;
}

export default function DocumentMap3D({
  graph,
  resetSignal,
  onOpenDocument,
}: {
  graph: DocumentMapGraph;
  resetSignal: number;
  onOpenDocument: (documentoId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef =
    useRef<ForceGraphMethods<DocumentMapNode, DocumentMapLink>>(undefined);
  const [width, setWidth] = useState(900);
  const graphData = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => ({ ...node })),
      links: graph.links.map((link) => ({ ...link })),
    }),
    [graph]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (resetSignal > 0) {
      graphRef.current?.zoomToFit(700, 80);
    }
  }, [resetSignal]);

  return (
    <div ref={containerRef} className="h-[min(72vh,760px)] min-h-[480px] w-full">
      <ForceGraph3D<DocumentMapNode, DocumentMapLink>
        ref={graphRef}
        graphData={graphData}
        width={width}
        height={Math.min(
          760,
          typeof window === "undefined" ? 680 : window.innerHeight * 0.72
        )}
        backgroundColor="#020617"
        showNavInfo
        nodeLabel={(node) =>
          `${node.title}<br/>${node.category}<br/>${neighborSummary(
            String(node.id),
            graphData.links
          )}`
        }
        nodeThreeObject={(node) => documentNodeMesh(node)}
        linkWidth={(link) => 0.5 + Number(link.score) * 2}
        linkOpacity={0.35}
        linkColor={() => "#7dd3fc"}
        cooldownTicks={120}
        onNodeClick={(node) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const z = node.z ?? 0;
          const distance = Math.hypot(x, y, z) || 1;
          const ratio = 1 + 90 / distance;
          graphRef.current?.cameraPosition(
            { x: x * ratio, y: y * ratio, z: z * ratio },
            { x, y, z },
            700
          );
          window.setTimeout(() => onOpenDocument(String(node.id)), 350);
        }}
      />
    </div>
  );
}
