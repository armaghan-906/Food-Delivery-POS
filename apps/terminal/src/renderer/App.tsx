import { useState } from 'react';
import type { StaffSummary, TableInfo } from '../shared/ipc-contract.js';
import { WelcomeScreen } from './system/WelcomeScreen';
import { StaffLogin } from './system/StaffLogin';
import { FloorPlan } from './floor/FloorPlan';
import { OrderScreen } from './order/OrderScreen';

/** Screens are built one at a time, in the Figma order (00-SYSTEM → 01-TILL → …). */
type Screen = 'welcome' | 'login' | 'floor' | 'order';

/**
 * The till shell and a minimal screen router. The authenticated staff member
 * flows from login into the floor plan and on into the order engine, so every
 * order event is attributed to whoever is actually signed in.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [staff, setStaff] = useState<StaffSummary | null>(null);
  const [table, setTable] = useState<TableInfo | null>(null);

  switch (screen) {
    case 'login':
      return (
        <StaffLogin
          onLoggedIn={(member) => {
            setStaff(member);
            setScreen('floor');
          }}
        />
      );
    case 'floor':
      return (
        <FloorPlan
          onOpenTable={(t) => {
            setTable(t);
            setScreen('order');
          }}
        />
      );
    case 'order':
      return (
        <OrderScreen
          staff={staff ?? undefined}
          table={table ?? undefined}
          onExit={() => setScreen('floor')}
        />
      );
    case 'welcome':
    default:
      return (
        <WelcomeScreen
          onStaffLogin={() => setScreen('login')}
          onAdminDashboard={() => setScreen('login')}
        />
      );
  }
}
