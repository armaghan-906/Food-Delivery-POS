/**
 * Floor-plan seed (screen 1.3). Positions mirror the Figma layout; a few bar
 * and terrace tables are included so the area tabs are meaningful.
 *
 * Pure data — no Node imports — so the till can also render it directly.
 */
export interface SeedTable {
  id: string;
  area: 'main' | 'bar' | 'terrace';
  number: string;
  seats: number;
  shape: 'round' | 'square';
  posX: number;
  posY: number;
  status: 'available' | 'occupied' | 'bill_requested' | 'needs_clean';
  covers: number;
  /** Minutes since the party sat; null when free. Drives "seated Xm". */
  seatedMinutesAgo: number | null;
}

export const SEED_TABLES: SeedTable[] = [
  // Main dining
  { id: 'tbl-1', area: 'main', number: 'T-1', seats: 2, shape: 'round', posX: 100, posY: 80, status: 'occupied', covers: 2, seatedMinutesAgo: 45 },
  { id: 'tbl-2', area: 'main', number: 'T-2', seats: 2, shape: 'round', posX: 300, posY: 80, status: 'available', covers: 0, seatedMinutesAgo: null },
  { id: 'tbl-3', area: 'main', number: 'T-3', seats: 4, shape: 'round', posX: 500, posY: 80, status: 'bill_requested', covers: 4, seatedMinutesAgo: 70 },
  { id: 'tbl-11', area: 'main', number: 'T-11', seats: 6, shape: 'square', posX: 100, posY: 280, status: 'occupied', covers: 4, seatedMinutesAgo: 20 },
  { id: 'tbl-12', area: 'main', number: 'T-12', seats: 4, shape: 'square', posX: 300, posY: 280, status: 'needs_clean', covers: 0, seatedMinutesAgo: null },
  { id: 'tbl-13', area: 'main', number: 'T-13', seats: 6, shape: 'square', posX: 500, posY: 280, status: 'available', covers: 0, seatedMinutesAgo: null },
  { id: 'tbl-21', area: 'main', number: 'T-21', seats: 2, shape: 'round', posX: 100, posY: 480, status: 'occupied', covers: 2, seatedMinutesAgo: 12 },
  { id: 'tbl-22', area: 'main', number: 'T-22', seats: 2, shape: 'round', posX: 300, posY: 480, status: 'occupied', covers: 2, seatedMinutesAgo: 55 },
  { id: 'tbl-23', area: 'main', number: 'T-23', seats: 4, shape: 'square', posX: 500, posY: 480, status: 'available', covers: 0, seatedMinutesAgo: null },
  { id: 'tbl-30', area: 'main', number: 'T-30', seats: 8, shape: 'square', posX: 750, posY: 180, status: 'occupied', covers: 8, seatedMinutesAgo: 100 },
  { id: 'tbl-31', area: 'main', number: 'T-31', seats: 10, shape: 'square', posX: 750, posY: 380, status: 'available', covers: 0, seatedMinutesAgo: null },
  // Bar
  { id: 'bar-1', area: 'bar', number: 'B-1', seats: 2, shape: 'round', posX: 100, posY: 80, status: 'occupied', covers: 2, seatedMinutesAgo: 30 },
  { id: 'bar-2', area: 'bar', number: 'B-2', seats: 2, shape: 'round', posX: 300, posY: 80, status: 'available', covers: 0, seatedMinutesAgo: null },
  { id: 'bar-3', area: 'bar', number: 'B-3', seats: 4, shape: 'square', posX: 100, posY: 280, status: 'bill_requested', covers: 3, seatedMinutesAgo: 40 },
  // Terrace
  { id: 'ter-1', area: 'terrace', number: 'TR-1', seats: 4, shape: 'square', posX: 100, posY: 80, status: 'available', covers: 0, seatedMinutesAgo: null },
  { id: 'ter-2', area: 'terrace', number: 'TR-2', seats: 6, shape: 'square', posX: 300, posY: 80, status: 'occupied', covers: 5, seatedMinutesAgo: 25 },
];
