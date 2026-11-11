export type InspectionKind = 'move_in' | 'move_out';
export type Condition = 'good' | 'fair' | 'damaged';
export interface Inspection { id: number; address: string; unit: string | null; kind: InspectionKind; started_at: number; finished_at: number | null; tenant_name: string | null; landlord_name: string | null; linked_move_in_id: number | null; move_out_date: number | null; state: string | null; }
export interface Room { id: number; inspection_id: number; name: string; sort: number; }
export interface Item { id: number; room_id: number; name: string; condition: Condition | null; note: string | null; sort: number; }
export interface Photo { id: number; item_id: number; file_uri: string; sha256: string; captured_at: number; width: number; height: number; source: 'camera'; }
export interface TemplateRoom { name: string; items: string[]; }
export interface Receipt { sha256: string; receipt_id: string; server_time: number; }
