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
      fgRef.current.d3Force('charge').strength(-300);
      fgRef.current.d3Force('link').distance(80);
      fgRef.current.d3ReheatSimulation();
    }
  }, [graphData]);

  return (
    <div ref={containerRef} className="w-full h-[250px] bg-bg-surface border-b border-bg-border relative overflow-hidden flex items-center justify-center">
      <div className="absolute top-3 left-4 z-10">
        <div className="text-[10px] font-mono tracking-widest text-green-primary">LIVE_AGENT_TRAFFIC</div>
        <div className="text-[9px] text-gray-mid font-mono mt-1">Autonomous buyer connections to this store</div>
      </div>
      
      <div className="absolute bottom-3 left-4 z-10 flex gap-4 text-[9px] font-mono text-gray-mid bg-bg-base/80 p-1.5 rounded border border-bg-border">
        <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#76B900] rounded-full shadow-[0_0_5px_#76B900]"></span> Purchase Success</div>
        <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#FF3B3B] rounded-full shadow-[0_0_5px_#FF3B3B]"></span> Policy Blocked</div>
        <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full shadow-[0_0_5px_#F59E0B]"></span> Pending Review</div>
      </div>

      {graphData.nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.group === 'merchant' ? 'MERCHANT_STORE' : `AGENT_${node.id.split('_').pop()?.slice(0,6).toUpperCase()}`;
            const fontSize = 10 / globalScale;
            ctx.font = `${fontSize}px monospace`;
            const textWidth = ctx.measureText(label).width;
            const padding = 4 / globalScale;
            const bckgDimensions = [textWidth + padding * 2, fontSize + padding * 2];
            
            const isStore = node.group === 'merchant';
            ctx.fillStyle = isStore ? 'rgba(118, 185, 0, 0.1)' : 'rgba(0, 191, 255, 0.1)';
            ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
            
            ctx.strokeStyle = isStore ? '#76B900' : '#00BFFF';
            ctx.lineWidth = 0.5 / globalScale;
            ctx.strokeRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isStore ? '#76B900' : '#00BFFF';
            ctx.fillText(label, node.x, node.y);
          }}
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
