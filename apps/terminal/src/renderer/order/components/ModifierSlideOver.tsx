import { useMemo, useState } from 'react';
import { ALLERGEN_LABELS, formatPence, pence, type Allergen } from '@pos/types';
import type { SeedMenuItem } from '@pos/local-db/menu';
import type { AddItemOptions } from '../useOrder';
import { modifierGroupsForItem, type CatalogItem } from '../catalog';
import { AlertBadgeIcon, MinusIcon, PlusCircleIcon, XCircleIcon } from '../icons';

/**
 * 01-TILL / 1.4 — Modifier Selection Slide-over.
 *
 * Opens when an item with modifier groups is tapped. Selections, price deltas
 * and the live allergen summary all come from the real seed modifier data; the
 * confirmed line goes through the same order engine as a plain add, which
 * freezes the chosen modifiers, their price deltas and the merged allergens.
 */

const INK = '#111827';
const MUTED = '#4b5563';
const BORDER = '#d1d5db';
const TEAL = '#0d7377';

interface ModifierSlideOverProps {
  item: CatalogItem;
  onClose: () => void;
  onConfirm: (opts: AddItemOptions) => void;
}

export function ModifierSlideOver({ item, onClose, onConfirm }: ModifierSlideOverProps) {
  const groups = useMemo(() => modifierGroupsForItem(item), [item]);

  // Single-select required groups start on their first option, like the design.
  const [selection, setSelection] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const g of groups) {
      if (g.maxSelections === 1 && g.minSelections >= 1 && g.modifiers[0]) {
        initial[g.id] = [g.modifiers[0].id];
      }
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);

  const toggle = (groupId: string, modId: string, max: number) => {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (max === 1) return { ...prev, [groupId]: [modId] };
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modId) };
      }
      if (current.length >= max) return prev; // respect the group's max
      return { ...prev, [groupId]: [...current, modId] };
    });
  };

  const selectedMods = useMemo(
    () =>
      groups.flatMap((g) =>
        (selection[g.id] ?? [])
          .map((id) => g.modifiers.find((m) => m.id === id))
          .filter((m): m is NonNullable<typeof m> => Boolean(m)),
      ),
    [groups, selection],
  );

  const deltaSum = selectedMods.reduce((sum, m) => sum + m.priceDeltaP, 0);
  const unit = item.priceP + deltaSum;
  const total = unit * quantity;

  const allergens = useMemo(() => summariseAllergens(item, selectedMods), [item, selectedMods]);

  // Any required group not yet satisfied blocks the add.
  const unmet = groups.some(
    (g) => g.minSelections >= 1 && (selection[g.id]?.length ?? 0) < g.minSelections,
  );

  const confirm = () => {
    if (unmet) return;
    onConfirm({
      quantity,
      modifiers: selectedMods.map((m) => ({
        modifierId: m.id,
        name: m.name,
        priceDeltaP: pence(m.priceDeltaP),
        allergens: (m.allergens ?? []).map((a) => ({ allergen: a.allergen, presence: a.presence })),
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative flex h-full w-[500px] flex-col bg-white shadow-[-4px_0_8px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex h-20 shrink-0 items-center justify-between border-b px-6"
          style={{ borderColor: '#e5e7eb' }}
        >
          <div>
            <p className="text-xl font-extrabold" style={{ color: INK }}>
              {item.name}
            </p>
            <p className="text-sm font-semibold" style={{ color: TEAL }}>
              {formatPence(pence(item.priceP))} Base Price
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white"
            style={{ borderColor: '#e5e7eb', color: MUTED }}
            aria-label="Close"
          >
            <XCircleIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-3">
              <p className="text-sm font-bold uppercase" style={{ color: MUTED }}>
                {g.name} ({g.maxSelections === 1 ? 'Select One' : 'Select Multi'})
              </p>
              <div className="flex flex-wrap gap-2">
                {g.modifiers.map((m) => {
                  const active = (selection[g.id] ?? []).includes(m.id);
                  const hasDelta = m.priceDeltaP !== 0;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(g.id, m.id, g.maxSelections)}
                      className="flex h-14 flex-col items-center justify-center rounded-[10px] px-4"
                      style={
                        active
                          ? { backgroundColor: TEAL, border: `1.5px solid ${TEAL}` }
                          : { backgroundColor: 'white', border: `1.5px solid ${BORDER}` }
                      }
                    >
                      <span
                        className="text-base font-bold"
                        style={{ color: active ? 'white' : INK }}
                      >
                        {m.name}
                      </span>
                      {hasDelta && (
                        <span
                          className="text-xs font-medium"
                          style={{ color: active ? '#e6f4f4' : MUTED }}
                        >
                          {m.priceDeltaP > 0 ? '+' : ''}
                          {formatPence(pence(m.priceDeltaP))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {(allergens.contains.length > 0 || allergens.mayContain.length > 0) && (
            <div
              className="flex items-start gap-3 rounded-lg border p-4"
              style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b' }}
            >
              <span style={{ color: '#b45309' }}>
                <AlertBadgeIcon className="h-6 w-6" />
              </span>
              <p className="text-[13px] font-semibold" style={{ color: '#b45309' }}>
                {allergens.contains.length > 0 && (
                  <>Contains: {allergens.contains.join(', ')}. </>
                )}
                {allergens.mayContain.length > 0 && (
                  <>May contain: {allergens.mayContain.join(', ')}.</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex shrink-0 flex-col gap-5 border-t p-6"
          style={{ borderColor: '#e5e7eb' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <StepBtn onClick={() => setQuantity((q) => Math.max(1, q - 1))} label="Decrease">
                <MinusIcon className="h-6 w-6" />
              </StepBtn>
              <span
                className="w-[60px] text-center text-[22px] font-extrabold"
                style={{ color: INK }}
              >
                {quantity}
              </span>
              <StepBtn onClick={() => setQuantity((q) => q + 1)} label="Increase">
                <PlusCircleIcon className="h-6 w-6" />
              </StepBtn>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold" style={{ color: MUTED }}>
                Total Amount
              </p>
              <p className="text-[28px] font-extrabold" style={{ color: TEAL }}>
                {formatPence(pence(total))}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={unmet}
            className="flex h-16 w-full items-center justify-center rounded-[10px] text-base font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            Add to Order ({formatPence(pence(total))})
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-14 w-14 items-center justify-center rounded-lg border bg-white"
      style={{ borderColor: '#e5e7eb', color: '#111827' }}
    >
      {children}
    </button>
  );
}

function summariseAllergens(
  item: SeedMenuItem,
  mods: { allergens?: { allergen: Allergen; presence: 'contains' | 'may_contain' }[] }[],
): { contains: string[]; mayContain: string[] } {
  const contains = new Set<Allergen>();
  const mayContain = new Set<Allergen>();
  const add = (tags?: { allergen: Allergen; presence: 'contains' | 'may_contain' }[]) => {
    for (const t of tags ?? []) {
      if (t.presence === 'contains') contains.add(t.allergen);
      else mayContain.add(t.allergen);
    }
  };
  add(item.allergens);
  for (const m of mods) add(m.allergens);
  // "Contains" wins over "may contain" for the same allergen.
  for (const a of contains) mayContain.delete(a);
  return {
    contains: [...contains].map((a) => ALLERGEN_LABELS[a]),
    mayContain: [...mayContain].map((a) => ALLERGEN_LABELS[a]),
  };
}
