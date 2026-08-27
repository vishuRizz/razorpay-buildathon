/* eslint-disable @typescript-eslint/no-explicit-any */
interface LogEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  action: string;
  input: any;
  output: any;
  reasoning: string;
  policy_result: any;
  duration_ms: number;
  error: string;
}

interface AuditDrawerProps {
  log: LogEntry;
  onClose: () => void;
}

export default function AuditDrawer({ log, onClose }: AuditDrawerProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        id="audit-drawer"
        className="fixed right-0 top-0 h-full w-[520px] bg-bg-surface border-l border-bg-border z-50 animate-slide-in overflow-y-auto"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">{log.action}</h2>
              <p className="text-gray-500 text-xs font-mono mt-1">{log.id}</p>
            </div>
            <button
              id="close-drawer"
              onClick={onClose}
              className="text-gray-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors"
            >
              ×
            </button>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { label: 'Timestamp', value: new Date(log.timestamp).toLocaleString() },
              { label: 'Duration', value: log.duration_ms ? `${log.duration_ms}ms` : '—' },
              { label: 'Agent ID', value: log.agent_id ?? '—' },
              { label: 'Action', value: log.action },
            ].map((m) => (
              <div key={m.label} className="bg-bg-elevated rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">{m.label}</div>
                <div className="text-sm text-gray-200 font-mono truncate">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Reasoning */}
          {log.reasoning && (
            <div className="mb-5">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
                💭 AI Reasoning Trace
              </div>
              <div className="bg-brand/5 border border-brand/10 rounded-lg p-4 text-sm text-gray-300 leading-relaxed italic">
                "{log.reasoning}"
              </div>
            </div>
          )}

          {/* Error */}
          {log.error && (
            <div className="mb-5">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
                ❌ Error
              </div>
              <div className="bg-status-blocked/5 border border-status-blocked/10 rounded-lg p-4 text-sm text-status-blocked font-mono">
                {log.error}
              </div>
            </div>
          )}

          {/* Policy Result */}
          {log.policy_result && (
            <div className="mb-5">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
                🛡️ Policy Result
              </div>
              <pre className="bg-bg-elevated rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto">
                {JSON.stringify(log.policy_result, null, 2)}
              </pre>
            </div>
          )}

          {/* Input */}
          {log.input && (
            <div className="mb-5">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
                📥 Input
              </div>
              <pre className="bg-bg-elevated rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto max-h-48">
                {JSON.stringify(log.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {log.output && (
            <div className="mb-5">
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
                📤 Output
              </div>
              <pre className="bg-bg-elevated rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto max-h-48">
                {JSON.stringify(log.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
