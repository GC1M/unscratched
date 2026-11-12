import type { Inspection, Item, Photo, Room } from '@/db/types';

export interface ReportItem { item: Item; photos: Photo[]; }
export interface ReportRoom { room: Room; items: ReportItem[]; }
export interface Acknowledgement {
  tenantName: string;
  landlordName: string | null;
  date: number;
  tenantSignature?: string | null; // SVG path data from strokesToPath; optional, drawn in addition to the typed name
  roommates?: Roommate[]; // other tenants on the lease, each acknowledging with their own line
}
export interface Roommate { name: string; signature: string | null; }
export interface ReportData {
  inspection: Inspection;
  rooms: ReportRoom[];
  thumbnails: Record<number, string>; // photo id -> data uri; a missing entry renders a "photo unavailable" box
  acknowledgement: Acknowledgement | null; // null: omit the signature lines' typed names but keep the statement
  generatedAt: number;
  receipts: Record<string, number>; // sha256 -> server time (ms); a photo without one renders "Receipt pending"
  verificationCode: string | null; // null until the manifest hash has a receipt
}
