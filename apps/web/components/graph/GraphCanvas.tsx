'use client';

import { Background, Controls, Handle, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { useMemo } from 'react';
import { canvasHeight, layout, nodeRadius } from '@/lib/graph/layout';
import type { GraphEdge, GraphNode } from '@/lib/graph/types';
import { cn } from '@/lib/utils';

const W = 900;

export const LAYER_COLOR: Record<GraphNode['layer'], string> = {
  ledger: 'var(--ledger)',
  procedure: 'var(--procedure)',
  retrospective: 'var(--retro)',
  context: 'var(--muted-ink)',
};

const COMMUNITY_COLOR = ['var(--ledger)', 'var(--procedure)', 'var(--retro)', 'var(--watch)', 'var(--better)', 'var(--worse)', 'var(--good)', 'var(--ink-2)'];

const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type EntityData = { node: GraphNode; color: string; isFocus: boolean };
type EntityNode = Node<EntityData, 'entity'>;

/** A graph entity: a disc sized by centrality, its type above and label below. */
function EntityNodeView({ data, selected }: NodeProps<EntityNode>) {
  const r = nodeRadius(data.node.centrality);
  return (
    <div className="relative flex flex-col items-center" style={{ width: 2 * r }}>
      {/* Type and label are drawn with CSS generated content: the node's accessible
          name is its aria-label, and a truncated visible label must not contradict it. */}
      <span aria-hidden="true" data-text={data.node.type} className="absolute -top-4 text-[10px] whitespace-nowrap text-muted-ink after:content-[attr(data-text)]" />
      <span
        aria-hidden="true"
        className={cn('block rounded-full border-2 transition-shadow', selected ? 'border-ink shadow-[0_0_0_3px_var(--ring)]' : data.isFocus ? 'border-ink-2' : 'border-card')}
        style={{ width: 2 * r, height: 2 * r, background: data.color }}
      />
      <span
        aria-hidden="true"
        data-text={short(data.node.label)}
        className={cn('absolute top-full mt-1 text-[11.5px] whitespace-nowrap text-ink [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card)] after:content-[attr(data-text)]', selected && 'font-semibold')}
      />
      {/* Edges attach at the centre; handles are invisible. */}
      <Handle type="target" position={Position.Top} className="!top-1/2 !h-px !min-h-0 !w-px !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle type="source" position={Position.Top} className="!top-1/2 !h-px !min-h-0 !w-px !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
    </div>
  );
}

const nodeTypes = { entity: EntityNodeView };

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus: string;
  selected: string;
  byCommunity: boolean;
  onSelect: (id: string) => void;
}

/** Interactive knowledge graph (React Flow): pan, zoom, drag nodes, click to inspect. */
function Flow({ nodes, edges, focus, selected, byCommunity, onSelect }: Props) {
  const { resolvedTheme } = useTheme();
  const H = canvasHeight(nodes);
  const initial = useMemo<EntityNode[]>(() => {
    const pos = layout(nodes, W, H);
    return nodes.map((n) => {
      const r = nodeRadius(n.centrality);
      return {
        id: n.id,
        type: 'entity',
        position: { x: pos[n.id].x - r, y: pos[n.id].y - r },
        data: { node: n, color: byCommunity ? COMMUNITY_COLOR[n.community % COMMUNITY_COLOR.length] : LAYER_COLOR[n.layer], isFocus: n.id === focus },
        ariaRole: 'button',
        ariaLabel: `${n.type}: ${n.label}`,
        domAttributes: { 'aria-pressed': n.id === selected, 'data-node': n.id } as React.HTMLAttributes<HTMLDivElement>,
      };
    });
    // Layout is computed once per graph; selection is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, H, byCommunity, focus]);
  const [state, , onNodesChange] = useNodesState(initial);
  const shown = state.map((n) => ({ ...n, selected: n.id === selected, domAttributes: { ...n.domAttributes, 'aria-pressed': n.id === selected } as React.HTMLAttributes<HTMLDivElement> }));
  const flowEdges: Edge[] = edges.map((e) => {
    const on = e.source === selected || e.target === selected;
    return {
      id: `${e.source}-${e.relation}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'straight',
      focusable: false,
      // No invisible hit area: links are not interactive and must not cover nodes.
      interactionWidth: 0,
      style: { stroke: on ? 'var(--ink)' : 'var(--rule-strong)', strokeWidth: on ? 1.8 : 1, strokeDasharray: e.confidence < 1 ? '4 4' : undefined, opacity: on ? 0.95 : 0.6 },
    };
  });

  return (
    // Fills the card (flex-1); the minimum keeps small graphs readable.
    <div className="h-full min-h-[420px] flex-1 rounded-lg border border-rule bg-card" style={{ minHeight: Math.min(Math.max(H * 0.75, 420), 620) }}>
      <ReactFlow
        nodes={shown}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          // Selection is controlled by the parent: report user selections (click, Enter, Space).
          const picked = changes.find((c) => c.type === 'select' && c.selected);
          if (picked && 'id' in picked && picked.id !== selected) onSelect(picked.id);
        }}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2.5}
        colorMode={resolvedTheme === 'light' ? 'light' : 'dark'}
        ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter or Space to inspect this node. Arrow keys move it.' }}
        aria-label={`Knowledge graph around ${focus}: ${nodes.length} nodes, ${edges.length} links`}
        className="[--xy-background-color:transparent] [--xy-controls-button-background-color:var(--surface)] [--xy-controls-button-color:var(--ink)]"
      >
        <Background gap={24} size={1} color="var(--rule)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphCanvas(props: Props) {
  // A new graph (focus, hops or colouring) starts from a fresh layout.
  return <Flow key={`${props.focus}|${props.nodes.length}|${props.byCommunity}`} {...props} />;
}

export function GraphLegend({ byCommunity }: { byCommunity: boolean }) {
  const items = byCommunity
    ? [{ label: 'Colour shows the community Semantica detected (Louvain)', color: 'var(--procedure)' }]
    : [
        { label: 'Ledger record', color: LAYER_COLOR.ledger },
        { label: 'Procedure document', color: LAYER_COLOR.procedure },
        { label: 'Evaluation or lesson', color: LAYER_COLOR.retrospective },
        { label: 'Shared context', color: LAYER_COLOR.context },
      ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-ink">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <svg width="18" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="18" y2="3" stroke="var(--rule-strong)" strokeDasharray="4 4" />
        </svg>
        Scored (inferred) link
      </li>
      <li>Larger nodes are more connected · drag to move, scroll or pinch to zoom</li>
    </ul>
  );
}
