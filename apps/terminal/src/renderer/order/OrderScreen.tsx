import { useEffect, useState } from 'react';
import type { StaffSummary, TableInfo } from '../../shared/ipc-contract.js';
import { useOrder, type Staff } from './useOrder';
import { itemHasModifiers, type CatalogItem } from './catalog';
import { TopBar } from './components/TopBar';
import { MenuBrowser } from './components/MenuBrowser';
import { ActiveTicket } from './components/ActiveTicket';
import { ModifierSlideOver } from './components/ModifierSlideOver';
import { SplitBill } from './components/SplitBill';
import { PaymentMethod } from './components/PaymentMethod';
import { CashPayment } from './components/CashPayment';
import { CardPayment } from './components/CardPayment';
import { DiscountVoidModal } from './components/DiscountVoidModal';
import { RefundScreen } from './components/RefundScreen';
import { ReceiptScreen } from './components/ReceiptScreen';
import { EODScreen } from './components/EODScreen';
import { OpenTabsScreen } from './components/OpenTabsScreen';

/**
 * 01-TILL / 1.2 — Order Screen (Main).
 *
 * The primary trading surface: browse the menu, build a ticket, take it to
 * payment. Every edit appends an event to the order log (see `useOrder`); the
 * UI only ever renders derived state.
 */
interface OrderScreenProps {
  /** The signed-in staff member; falls back to the default session in dev. */
  staff?: StaffSummary | undefined;
  /** The dine-in table this order belongs to, when opened from the floor plan. */
  table?: TableInfo | undefined;
  onExit?: (() => void) | undefined;
}

export function OrderScreen({ staff: loggedIn, table, onExit }: OrderScreenProps = {}) {
  const tableLabel = table ? `Table ${table.number.replace(/^T-?/, '')} · ${table.seats} covers` : undefined;
  const activeStaff: Staff | undefined = loggedIn
    ? { id: loggedIn.id, name: loggedIn.name, role: loggedIn.role }
    : undefined;
  const {
    order,
    totals,
    staff,
    addItem,
    incQty,
    decQty,
    voidLine,
    applyDiscount,
    setChannel,
    payCash,
    addTip,
    payCard,
    issueRefund,
    heldOrders,
    holdCurrent,
    recallHeld,
    voidHeld,
  } = useOrder(activeStaff);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [modifierItem, setModifierItem] = useState<CatalogItem | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCash, setShowCash] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [backOffice, setBackOffice] = useState<'refund' | 'receipt' | 'eod' | 'tabs' | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  // Back-office tab navigation (the Refund / Receipt / … header tabs).
  const goTab = (tab: string) => {
    if (tab === 'Refund') setBackOffice('refund');
    else if (tab === 'Receipt Preview') setBackOffice('receipt');
    else if (tab === 'EOD Cash-Up') setBackOffice('eod');
    else if (tab === 'Open Tabs') setBackOffice('tabs');
  };

  // Items with modifier groups open the slide-over (1.4); the rest add directly.
  const handleAdd = (item: CatalogItem) => {
    if (itemHasModifiers(item)) setModifierItem(item);
    else addItem(item);
  };

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const handleVoid = (lineId: string) => {
    voidLine(lineId);
    setSelectedLineId(null);
  };

  if (showSplit) {
    return (
      <SplitBill
        order={order}
        totals={totals}
        tableLabel={tableLabel}
        onBack={() => setShowSplit(false)}
        payCash={payCash}
      />
    );
  }

  if (showPayment) {
    return (
      <PaymentMethod
        order={order}
        totals={totals}
        staff={staff}
        tableLabel={tableLabel}
        online={online}
        onBack={() => setShowPayment(false)}
        onSplit={() => {
          setShowPayment(false);
          setShowSplit(true);
        }}
        onComplete={(method, tipP) => {
          if (tipP > 0) addTip(tipP);
          if (method === 'cash') {
            // Hand off to the cash tender screen (1.7).
            setShowPayment(false);
            setShowCash(true);
            return;
          }
          if (method === 'card') {
            // Hand off to the card terminal screen (1.8).
            setShowPayment(false);
            setShowCard(true);
            return;
          }
          // Voucher lands here for now — settle the full amount.
          payCash(totals.totalP + tipP);
          setShowPayment(false);
          onExit?.();
        }}
      />
    );
  }

  if (showCash) {
    return (
      <CashPayment
        totals={totals}
        staff={staff}
        tableLabel={tableLabel}
        onCancel={() => {
          setShowCash(false);
          setShowPayment(true);
        }}
        onConfirm={(amountDueP, tenderedP) => {
          payCash(amountDueP, tenderedP);
          setShowCash(false);
          onExit?.();
        }}
      />
    );
  }

  if (backOffice === 'refund') {
    return (
      <RefundScreen
        order={order}
        totals={totals}
        staff={staff}
        tableLabel={tableLabel}
        onBack={() => setBackOffice(null)}
        onTab={goTab}
        issueRefund={issueRefund}
      />
    );
  }

  if (backOffice === 'receipt') {
    return (
      <ReceiptScreen
        order={order}
        totals={totals}
        staff={staff}
        tableLabel={tableLabel}
        onBack={() => setBackOffice(null)}
        onTab={goTab}
        onDone={() => setBackOffice(null)}
      />
    );
  }

  if (backOffice === 'eod') {
    return (
      <EODScreen
        order={order}
        totals={totals}
        staff={staff}
        onBack={() => setBackOffice(null)}
        onTab={goTab}
      />
    );
  }

  if (backOffice === 'tabs') {
    return (
      <OpenTabsScreen
        heldOrders={heldOrders}
        staff={staff}
        onBack={() => setBackOffice(null)}
        onTab={goTab}
        onRecall={(id) => {
          recallHeld(id);
          setBackOffice(null);
        }}
        onVoid={voidHeld}
      />
    );
  }

  if (showCard) {
    return (
      <CardPayment
        totals={totals}
        onCancel={() => {
          setShowCard(false);
          setShowPayment(true);
        }}
        onSwitchToCash={() => {
          setShowCard(false);
          setShowCash(true);
        }}
        onApproved={(amountP, authCode) => payCard(amountP, authCode)}
        onDone={() => {
          setShowCard(false);
          onExit?.();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <TopBar
        staff={staff}
        channel={order.channel}
        online={online}
        tableLabel={tableLabel}
        onMenu={() => setBackOffice('refund')}
        onChannelChange={(channel) => {
          setChannel(channel);
          setSelectedLineId(null);
        }}
      />
      <div className="flex min-h-0 flex-1">
        <MenuBrowser onAdd={handleAdd} />
        <ActiveTicket
          order={order}
          totals={totals}
          staff={staff}
          selectedLineId={selectedLineId}
          onSelectLine={setSelectedLineId}
          onInc={incQty}
          onDec={decQty}
          onVoid={handleVoid}
          onPay={() => setShowPayment(true)}
          onSplit={() => setShowSplit(true)}
          onDiscount={() => setShowDiscount(true)}
          onHold={() => holdCurrent(order.channel === 'dine_in' ? tableLabel : undefined)}
        />
      </div>

      {modifierItem && (
        <ModifierSlideOver
          item={modifierItem}
          onClose={() => setModifierItem(null)}
          onConfirm={(opts) => {
            addItem(modifierItem, opts);
            setModifierItem(null);
          }}
        />
      )}

      {showDiscount && (
        <DiscountVoidModal
          order={order}
          totals={totals}
          selectedLineId={selectedLineId}
          onClose={() => setShowDiscount(false)}
          applyDiscount={applyDiscount}
          voidLine={voidLine}
        />
      )}
    </div>
  );
}
