import React, { createContext, useContext, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LiveFeed from './pages/LiveFeed';
import PolicyEditor from './pages/PolicyEditor';
import AuditLog from './pages/AuditLog';
import Analytics from './pages/Analytics';

// ── Global store context ──────────────────────────────────────
interface AppContextType {
  merchantId: string;
  setMerchantId: (id: string) => void;
  pendingCount: number;
  setPendingCount: (n: number) => void;
}

const AppContext = createContext<AppContextType>({
  merchantId: '',
  setMerchantId: () => {},
  pendingCount: 0,
  setPendingCount: () => {},
});

export const useApp = () => useContext(AppContext);

export default function App() {
  // In a real app this would come from auth. For demo, enter merchant ID in sidebar.
  const [merchantId, setMerchantId] = useState(
    localStorage.getItem('aisle_merchant_id') ?? ''
  );
  const [pendingCount, setPendingCount] = useState(0);

  const handleSetMerchantId = (id: string) => {
    setMerchantId(id);
    localStorage.setItem('aisle_merchant_id', id);
  };

  return (
    <AppContext.Provider value={{ merchantId, setMerchantId: handleSetMerchantId, pendingCount, setPendingCount }}>
      <BrowserRouter>
        <div className="flex min-h-[100dvh] overflow-hidden bg-bg-base">
          <Sidebar />
          <main className="flex-1 overflow-y-auto h-screen">
            <Routes>
              <Route path="/" element={<Navigate to="/live" replace />} />
              <Route path="/live" element={<LiveFeed />} />
              <Route path="/policy" element={<PolicyEditor />} />
              <Route path="/logs" element={<AuditLog />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
