export interface FeatureItem {
  id: number;
  title: string;
  description: string;
  status: string;
  metric: string;
}

export interface KpiItem {
  label: string;
  value: string;
  trend: string;
  tone: string;
}

export interface OperationRecord {
  key: string;
  name: string;
  owner: string;
  status: string;
  metric: string;
  priority: string;
}

export interface OverviewResponse {
  appName: string;
  appCode: string;
  description: string;
  features: FeatureItem[];
  kpis: KpiItem[];
  records: OperationRecord[];
}

export interface StoreInfo {
  id: number;
  code: string;
  name: string;
}

export interface CatalogItem {
  productId: number;
  sku: string;
  name: string;
  spec: string;
  category: string;
  quantity: number;
  frozen: boolean;
  frozenOrderId: number | null;
}

export interface StocktakeLineView {
  lineId: number;
  productId: number;
  sku: string;
  name: string;
  spec: string;
  bookQuantity: number;
  actualQuantity: number | null;
  difference: number | null;
}

export interface StocktakeMovementView {
  id: number;
  productId: number;
  productName: string;
  changeType: string;
  quantity: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface StocktakeOrderSummary {
  id: number;
  orderNo: string;
  storeId: number;
  storeName: string;
  status: "in_progress" | "completed" | "cancelled";
  operator: string;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  totalLines: number;
  countedLines: number;
  surplus: number;
  deficit: number;
}

export interface StocktakeOrderDetail extends StocktakeOrderSummary {
  lines: StocktakeLineView[];
  movements: StocktakeMovementView[];
}

export interface StocktakeOrderList {
  inProgress: StocktakeOrderSummary[];
  recentFinished: StocktakeOrderSummary[];
}

export interface MovementResult {
  movementId: number;
  productId: number;
  productName: string;
  changeType: string;
  quantity: number;
  balanceAfter: number;
  createdAt: string;
}
