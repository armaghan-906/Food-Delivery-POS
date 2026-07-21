import welcomeBg from '../assets/welcome-bg.png';
import { ChartColumnIcon, ChefHatIcon, KeyRoundIcon } from '../order/icons';

/**
 * 00-SYSTEM / Welcome Screen.
 *
 * The idle/attract screen the terminal shows before anyone signs in. Built to
 * match the Figma frame exactly: photographic backdrop under a slate gradient,
 * GustoPOS brand, and the two entry points (staff login / admin dashboard).
 */
interface WelcomeScreenProps {
  onStaffLogin: () => void;
  onAdminDashboard: () => void;
}

// Matches the Figma overlay: linear-gradient(48.37deg, #0f172a cc → 80 → 1a).
const OVERLAY =
  'linear-gradient(48.37deg, rgba(15,23,42,0.8) 33.33%, rgba(15,23,42,0.502) 50%, rgba(15,23,42,0.102) 66.67%)';

export function WelcomeScreen({ onStaffLogin, onAdminDashboard }: WelcomeScreenProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Backdrop + gradient */}
      <img
        src={welcomeBg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0" style={{ backgroundImage: OVERLAY }} />

      {/* Header */}
      <header className="relative flex items-center justify-between p-16">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white">
            <ChefHatIcon className="h-7 w-7" />
          </div>
          <p className="text-[28px] leading-none text-white">
            <span className="font-extrabold">Gusto</span>
            <span className="font-light text-brand-50">POS</span>
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-[30px] border border-white/20 bg-white/10 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
          <span className="text-sm font-semibold text-white">Terminal #402 Active</span>
        </div>
      </header>

      {/* Spacer pushes content to the bottom, per the Figma layout */}
      <div className="relative flex-1" />

      {/* Content */}
      <div className="relative flex flex-col gap-12 p-16">
        <div className="flex max-w-[800px] flex-col gap-4">
          <h1 className="text-[64px] font-extrabold leading-[72px] text-white">
            Welcome to GustoPOS
          </h1>
          <p className="text-2xl leading-8 text-[#e2e8f0]">
            Complete restaurant management. From kitchen to doorstep.
          </p>
        </div>

        <div className="flex items-start gap-5">
          <button
            type="button"
            onClick={onStaffLogin}
            className="flex items-center gap-3 rounded-2xl bg-brand-500 px-10 py-5 text-lg font-bold text-white shadow-[0px_8px_12px_rgba(0,0,0,0.25)] transition-colors hover:bg-brand-700"
          >
            <KeyRoundIcon className="h-5 w-5" />
            Staff Login
          </button>
          <button
            type="button"
            onClick={onAdminDashboard}
            className="flex items-center gap-3 rounded-2xl border-2 border-white px-10 py-5 text-lg font-bold text-white transition-colors hover:bg-white/10"
          >
            <ChartColumnIcon className="h-5 w-5" />
            Admin Dashboard
          </button>
        </div>

        <div className="h-px w-full bg-white/20" />

        <footer className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
            <p className="text-sm font-medium text-faint">
              v2.4.1 • All systems online • Last sync: 2 min ago
            </p>
          </div>
          <p className="text-sm font-medium text-faint">London Soho Central</p>
        </footer>
      </div>
    </div>
  );
}
