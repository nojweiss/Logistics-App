import type { OrderItem, PickRow } from "./types";
export interface Product {
  id: string;
  name: string;
  sku: string;
  pick_row_id: string;
  active: boolean;
  case_pack_display: string | null;
  case_pack_levels: number[] | null;
  units_per_case: number | null;
  version: number;
}
export interface Worker {
  id: string;
  name: string;
  initials: string;
  active: boolean;
  version: number;
}
export interface DailyAssignment {
  work_date: string;
  worker_id: string;
  pick_row_id: string | null;
}
export interface OrderWorker {
  at_start?: boolean;
  joined_at?: string;
  order_id: string;
  worker_id: string;
  initial_row_id: string | null;
  current_row_id: string | null;
  name_snapshot: string;
  initials_snapshot: string;
}
export interface OperationGroup {
  id: string;
  name: string;
  repack_row_id: string;
  box_prefix: string;
}
export interface RepackBox {
  id: string;
  order_id: string;
  group_id: string;
  station_row_id: string;
  prefix: string;
  box_number: number;
  status: "OPEN" | "CLOSED";
  created_at: string;
  completed_at: string | null;
  version: number;
}
export interface RepackLine {
  id: string;
  order_id: string;
  box_id: string;
  order_item_id: string;
  expected_qty: number;
  actual_qty: number;
  removed_at: string | null;
  updated_at: string;
  updated_by: string;
  version: number;
}
export interface FullVerification {
  order_item_id: string;
  order_id: string;
  expected_qty: number;
  actual_qty: number;
  status: "VERIFIED" | "DISCREPANCY";
  verifier_id: string;
  verifier_name: string;
  verified_at: string;
  version: number;
}
export interface Discrepancy {
  id: string;
  order_id: string;
  order_item_id: string;
  box_id: string | null;
  kind: "REPACK" | "FULL_CASE";
  expected_qty: number;
  actual_qty: number;
  status: "OPEN" | "RESOLVED" | "SUPERSEDED";
  note: string;
  created_at: string;
  resolved_at: string | null;
}
export interface GroupStatus {
  order_id: string;
  group_id: string;
  is_ready: boolean;
  ready_at: string | null;
  palletize_started_at: string | null;
}
export interface Attention {
  id: string;
  order_id: string;
  order_item_id: string;
  pick_row_id: string;
  kind: "LOW" | "ZERO";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  available_cases: number | null;
  available_packs: number | null;
  reporter_name: string;
  created_at: string;
  updated_at: string;
  note: string;
  version: number;
  order_items?: OrderItem;
  orders?: { order_number: string; stand_name: string };
}
export interface AuditEvent {
  id: string;
  type: string;
  occurred_at: string;
  pick_row_id: string | null;
  payload: Record<string, unknown>;
}
export interface Movement {
  id: string;
  occurred_at: string;
  source_row_id: string | null;
  destination_row_id: string | null;
  worker_count: number;
}
export interface CaseCounts {
  order_id: string;
  full_cases: number;
  repack_boxes: number;
  total_cases: number;
}
export interface WorkflowData {
  staffingSnapshot?: {
    total_workers: number | null;
    float_workers: number | null;
    captured_at: string;
  } | null;
  staffingRows?: { pick_row_id: string; worker_count: number }[];
  groups: OperationGroup[];
  workers: Worker[];
  team: OrderWorker[];
  boxes: RepackBox[];
  lines: RepackLine[];
  verifications: FullVerification[];
  discrepancies: Discrepancy[];
  attention: Attention[];
  groupStatus: GroupStatus[];
  counts: CaseCounts | null;
  events: AuditEvent[];
  movements: Movement[];
}
export interface StaffingData {
  workers: Worker[];
  assignments: DailyAssignment[];
  rows: PickRow[];
}
export type Act = (
  action: () => Promise<void>,
  success: string,
) => Promise<void>;
