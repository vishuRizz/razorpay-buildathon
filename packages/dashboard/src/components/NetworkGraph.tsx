import React, { useMemo, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface LogEntry {
  agent_id: string;
  action: string;
  merchant_id?: string;
}

interface NetworkGraphProps {
  logs: LogEntry[];
  merchantId: string;
}

export default function NetworkGraph({ logs, merchantId }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>();
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 250 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodes = new Map<string, any>();
    const links = new Map<string, any>();

    // Add merchant node
    nodes.set(merchantId, { id: merchantId, group: 'merchant', val: 20 });

    logs.forEach(log => {
      if (!log.agent_id) return;
      
      // Add agent node
      if (!nodes.has(log.agent_id)) {
        nodes.set(log.agent_id, { id: log.agent_id, group: 'agent', val: 5 });
      }

      // Add link
      const linkId = `${log.agent_id}-${merchantId}`;
      if (!links.has(linkId)) {
        links.set(linkId, { source: log.agent_id, target: merchantId, weight: 1, lastAction: log.action });
      } else {
        const link = links.get(linkId);
        link.weight += 1;
        link.lastAction = log.action;
      }
    });

    return {
      nodes: Array.from(nodes.values()),
      links: Array.from(links.values())
    };
  }, [logs, merchantId]);

  useEffect(() => {
    // Re-heat simulation when data changes
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-200);
      fgRef.current.d3ReheatSimulation();
    }
  }, [graphData]);

  return (
    <div ref={containerRef} className="w-full h-[250px] bg-bg-surface border-b border-bg-border relative overflow-hidden flex items-center justify-center">
      <div className="absolute top-3 left-4 z-10">
        <div className="text-[10px] font-mono tracking-widest text-green-primary">AGENT_NETWORK_TOPOLOGY</div>
        <div className="text-[9px] text-gray-mid font-mono mt-1">Live active connections</div>
      </div>
      
      {graphData.nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="id"
          nodeColor={node => node.group === 'merchant' ? '#76B900' : '#00BFFF'}
          nodeRelSize={4}
          linkColor={link => {
            const action = (link as any).lastAction;
            if (['POLICY_BLOCK', 'CHECKOUT_FAILED', 'HUMAN_REVIEW_REJECTED'].includes(action)) return '#FF3B3B';
            if (action === 'HUMAN_REVIEW_REQUESTED') return '#F59E0B';
            return 'rgba(118, 185, 0, 0.4)';
          }}
          linkWidth={link => Math.min((link as any).weight, 5)}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleSpeed={0.01}
          linkDirectionalParticleColor={link => {
            const action = (link as any).lastAction;
            if (['POLICY_BLOCK', 'CHECKOUT_FAILED', 'HUMAN_REVIEW_REJECTED'].includes(action)) return '#FF3B3B';
            if (action === 'HUMAN_REVIEW_REQUESTED') return '#F59E0B';
            return '#76B900';
          }}
          backgroundColor="#0D0D0D"
        />
      )}
    </div>
  );
}
