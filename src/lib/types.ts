import type { WorkflowData } from "./operations";
export type Role = "ADMIN" | "SHEET_MANAGER" | "PICK_LEAD";
export type OrderStatus = "PLANNED" | "ACTIVE" | "COMPLETE";
export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  assigned_row_id: string | null;
  active: boolean;
}
export interface Order {
  palletize_started_at?: string | null;
  id: string;
  order_number: string;
  stand_name: string;
  scheduled_date: string;
  status: OrderStatus;
  started_at: string | null;
  completed_at: string | null;
}
export interface PickRow {
  group_id?: string;
  verification_role?: "REPACK" | "FULL_CASE";
  id: string;
  building: number;
  sort_order: number;
}
export interface OrderItem {
  group_id?: string;
  case_pack_display?: string | null;
  case_pack_levels?: number[] | null;
  units_per_case?: number | null;
  picker_worker_id?: string | null;
  picker_initials?: string | null;
  original_picker_initials?: string | null;
  original_picked_at?: string | null;
  pick_version?: number;
  id: string;
  order_id: string;
  product_id: string;
  pick_row_id: string;
  sku: string;
  product_name: string;
  full_case_qty: number;
  loose_qty: number;
  completed_case_qty: number;
  completed_loose_qty: number;
  completed_at: string | null;
}
export interface PickSession {
  clearing_started_at?: string | null;
  clearing_completed_at?: string | null;
  id: string;
  order_id: string;
  pick_row_id: string;
  row_started_at: string | null;
  row_completed_at: string | null;
}
export interface OrderDetail {
  workflow?: WorkflowData;
  order: Order;
  rows: PickRow[];
  items: OrderItem[];
  sessions: PickSession[];
}
