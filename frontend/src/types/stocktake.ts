export interface Store {
  id: number;
  code: string;
  name: string;
  manager: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  spec: string;
  barcode: string;
  category: string;
  unit: string;
}

export interface StoreProduct extends Product {
  productId: number;
  quantity: number;
  safetyQty: number;
  paused: boolean;
}

export type StocktakeStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface StocktakeItem {
  itemId: number;
  productId: number;
  sku: string;
  name: string;
  spec: string;
  barcode: string;
  unit: string;
  bookQuantity: number;
  countedQty: number | null;
  variance: number | null;
  countStatus: "PENDING" | "COUNTED";
}

export interface StocktakeSummary {
  id: number;
  code: string;
  storeId: number;
  storeName: string;
  status: StocktakeStatus;
  statusLabel: string;
  remark: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdBy: string;
  itemCount: number;
  countedCount: number;
  totalVariance: number | null;
  items?: StocktakeItem[];
}

export interface StoreProductsResponse {
  store: Store;
  pausedStocktakeId: number | null;
  products: StoreProduct[];
}

export interface InventoryTransaction {
  id: number;
  storeId: number;
  productId: number;
  productName: string;
  sku: string;
  type: "INBOUND" | "OUTBOUND" | "ADJUST";
  typeLabel: string;
  changeQty: number;
  balance: number;
  reason: string;
  refCode: string | null;
  createdAt: string;
  createdBy: string;
}

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}
