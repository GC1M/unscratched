import type { InspectionKind } from '@/db/types';

export const shortDate = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const kindLabel = (kind: InspectionKind) => (kind === 'move_in' ? 'Move-in' : 'Move-out');
