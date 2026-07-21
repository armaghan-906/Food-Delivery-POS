import { useMemo, useState } from 'react';
import { formatPence, pence, type AllergenTag } from '@pos/types';
import {
  ALLERGEN_ABBR,
  CATEGORIES,
  ITEMS,
  type CatalogItem,
} from '../catalog';
import { PlusIcon, SearchIcon } from '../icons';

interface MenuBrowserProps {
  onAdd: (item: CatalogItem) => void;
}

export function MenuBrowser({ onAdd }: MenuBrowserProps) {
  const [activeCat, setActiveCat] = useState(CATEGORIES[0]?.id ?? '');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((item) => {
      if (q) return item.name.toLowerCase().includes(q);
      return item.categoryId === activeCat;
    });
  }, [activeCat, query]);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      {/* Category tabs + search */}
      <div className="flex items-center gap-3 px-5 pt-4">
        <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const active = cat.id === activeCat && !query;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCat(cat.id);
                  setQuery('');
                }}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'border border-line bg-white text-ink hover:border-brand-500'
                }`}
              >
                {cat.name}
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                    active ? 'bg-white/25 text-white' : 'bg-canvas text-subtle'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex w-56 shrink-0 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
          <SearchIcon className="h-4 w-4 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search menu…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
        </div>
      </div>

      {/* Allergen key */}
      <div className="flex items-center gap-2 px-5 py-2.5 text-[11px] text-subtle">
        <span className="font-bold uppercase tracking-wide text-faint">Allergen key</span>
        <span className="inline-flex items-center gap-1">
          <AllergenBadge tag={{ allergen: 'gluten', presence: 'contains' }} />
          contains
        </span>
        <span className="inline-flex items-center gap-1">
          <AllergenBadge tag={{ allergen: 'nuts', presence: 'may_contain' }} />
          may contain
        </span>
        <span className="text-faint">— badges show the statutory allergens in each dish</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {visible.length === 0 ? (
          <p className="pt-16 text-center text-sm text-subtle">No items match “{query}”.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((item) => (
              <MenuCard key={item.id} item={item} onAdd={onAdd} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuCard({ item, onAdd }: { item: CatalogItem; onAdd: (i: CatalogItem) => void }) {
  const allergens = item.allergens ?? [];
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      className="group flex min-h-[132px] flex-col rounded-lg border border-line bg-white p-3.5 text-left transition-shadow hover:border-brand-500 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-bold leading-snug text-ink">{item.name}</h3>
        {allergens.length > 0 && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {allergens.map((tag) => (
              <AllergenBadge key={tag.allergen} tag={tag} />
            ))}
          </div>
        )}
      </div>
      {item.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-subtle">
          {item.description}
        </p>
      )}
      <div className="mt-auto flex items-end justify-between pt-3">
        <span className="text-xl font-bold text-brand-500">
          {formatPence(pence(item.priceP))}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
          <PlusIcon className="h-5 w-5" />
        </span>
      </div>
    </button>
  );
}

export function AllergenBadge({ tag }: { tag: AllergenTag }) {
  const contains = tag.presence === 'contains';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        contains
          ? 'bg-[#fef9c3] text-[#a16207]'
          : 'border border-line bg-white text-faint'
      }`}
      title={`${tag.allergen}${contains ? '' : ' (may contain)'}`}
    >
      {ALLERGEN_ABBR[tag.allergen]}
    </span>
  );
}
