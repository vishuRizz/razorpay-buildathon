import React, { createContext, useContext, useState, Dispatch, SetStateAction } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import LiveFeed from './pages/LiveFeed';
import PolicyEditor from './pages/PolicyEditor';
import AuditLog from './pages/AuditLog';
import Analytics from './pages/Analytics';
import SimulatePanel from './pages/SimulatePanel';
import AgentBrain from './pages/AgentBrain';
import Landing from './pages/Landing';

// ── Global store context ──────────────────────────────────────
interface AppContextType {
  merchantId: string;
  setMerchantId: (id: string) => void;
  pendingCount: number;
  setPendingCount: Dispatch<SetStateAction<number>>;
}

const AppContext = createContext<AppContextType>({
  merchantId: '',
  setMerchantId: () => {},
  pendingCount: 0,
  setPendingCount: () => {},
});

export const useApp = () => useContext(AppContext);

export default function App() {
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
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<DashboardLayout />}>
            <Route path="/live" element={<LiveFeed />} />
            <Route path="/brain" element={<AgentBrain />} />
            <Route path="/simulate" element={<SimulatePanel />} />
            <Route path="/policy" element={<PolicyEditor />} />
            <Route path="/logs" element={<AuditLog />} />
            <Route path="/analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}

function DashboardLayout() {
  return (
    <div className="flex min-h-[100dvh] overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto h-screen bg-background">
        <Outlet />
      </main>
    </div>
  );
}
