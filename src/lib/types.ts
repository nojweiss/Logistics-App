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
  id: string;
  order_number: string;
  stand_name: string;
  scheduled_date: string;
  status: OrderStatus;
  started_at: string | null;
  completed_at: string | null;
}
export interface PickRow {
  id: string;
  building: number;
  sort_order: number;
}
export interface OrderItem {
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
  id: string;
  order_id: string;
  pick_row_id: string;
  row_started_at: string | null;
  row_completed_at: string | null;
}
export interface OrderDetail {
  order: Order;
  rows: PickRow[];
  items: OrderItem[];
  sessions: PickSession[];
}
