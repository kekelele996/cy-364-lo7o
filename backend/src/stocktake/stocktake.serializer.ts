import type {
  InventoryTransaction,
  Product,
  Stocktake,
  StocktakeItem,
  Store,
} from "@prisma/client";

export type StocktakeStatusView = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface StoreView {
  id: number;
  code: string;
  name: string;
  manager: string;
}

export interface ProductView {
  id: number;
  sku: string;
  name: string;
  spec: string;
  barcode: string;
  category: string;
  unit: string;
}

export interface InventoryView {
  productId: number;
  quantity: number;
  safetyQty: number;
  paused: boolean;
}

export interface StoreProductRow extends ProductView, InventoryView {}

export interface StocktakeItemView {
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

export interface StocktakeView {
  id: number;
  code: string;
  storeId: number;
  storeName: string;
  status: StocktakeStatusView;
  statusLabel: string;
  remark: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdBy: string;
  itemCount: number;
  countedCount: number;
  totalVariance: number | null;
  items?: StocktakeItemView[];
}

export interface TransactionView {
  id: number;
  storeId: number;
  productId: number;
  productName: string;
  sku: string;
  type: string;
  typeLabel: string;
  changeQty: number;
  balance: number;
  reason: string;
  refCode: string | null;
  createdAt: string;
  createdBy: string;
}

const STATUS_LABELS: Record<StocktakeStatusView, string> = {
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const TX_TYPE_LABELS: Record<string, string> = {
  INBOUND: "入库",
  OUTBOUND: "出库",
  ADJUST: "盘点调整",
};

export function toStoreView(store: Store): StoreView {
  return { id: store.id, code: store.code, name: store.name, manager: store.manager };
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    spec: product.spec,
    barcode: product.barcode,
    category: product.category,
    unit: product.unit,
  };
}

type StocktakeWithItems = Stocktake & {
  store: Store;
  items: (StocktakeItem & { product: Product })[];
};

export function toStocktakeView(stocktake: StocktakeWithItems): StocktakeView {
  const countedItems = stocktake.items.filter((item) => item.countedQty !== null);
  const completed = stocktake.status === "COMPLETED";
  const totalVariance = completed
    ? stocktake.items.reduce((sum, item) => sum + (item.variance ?? 0), 0)
    : null;

  return {
    id: stocktake.id,
    code: stocktake.code,
    storeId: stocktake.storeId,
    storeName: stocktake.store.name,
    status: stocktake.status,
    statusLabel: STATUS_LABELS[stocktake.status] ?? stocktake.status,
    remark: stocktake.remark,
    startedAt: stocktake.startedAt.toISOString(),
    finishedAt: stocktake.finishedAt ? stocktake.finishedAt.toISOString() : null,
    createdBy: stocktake.createdBy,
    itemCount: stocktake.items.length,
    countedCount: countedItems.length,
    totalVariance,
    items: stocktake.items.map((item) => ({
      itemId: item.id,
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      spec: item.product.spec,
      barcode: item.product.barcode,
      unit: item.product.unit,
      bookQuantity: item.bookQuantity,
      countedQty: item.countedQty,
      variance: item.variance,
      countStatus: item.countStatus,
    })),
  };
}

type StocktakeListRow = Stocktake & {
  store: Store;
  items: Pick<StocktakeItem, "countedQty" | "variance">[];
};

export function toStocktakeListItem(stocktake: StocktakeListRow): StocktakeView {
  const countedCount = stocktake.items.filter((item) => item.countedQty !== null).length;
  const completed = stocktake.status === "COMPLETED";
  return {
    id: stocktake.id,
    code: stocktake.code,
    storeId: stocktake.storeId,
    storeName: stocktake.store.name,
    status: stocktake.status,
    statusLabel: STATUS_LABELS[stocktake.status] ?? stocktake.status,
    remark: stocktake.remark,
    startedAt: stocktake.startedAt.toISOString(),
    finishedAt: stocktake.finishedAt ? stocktake.finishedAt.toISOString() : null,
    createdBy: stocktake.createdBy,
    itemCount: stocktake.items.length,
    countedCount,
    totalVariance: completed
      ? stocktake.items.reduce((sum, item) => sum + (item.variance ?? 0), 0)
      : null,
  };
}

type TransactionRow = InventoryTransaction & { product: Product };

export function toTransactionView(tx: TransactionRow): TransactionView {
  return {
    id: tx.id,
    storeId: tx.storeId,
    productId: tx.productId,
    productName: tx.product.name,
    sku: tx.product.sku,
    type: tx.type,
    typeLabel: TX_TYPE_LABELS[tx.type] ?? tx.type,
    changeQty: tx.changeQty,
    balance: tx.balance,
    reason: tx.reason,
    refCode: tx.refCode,
    createdAt: tx.createdAt.toISOString(),
    createdBy: tx.createdBy,
  };
}
