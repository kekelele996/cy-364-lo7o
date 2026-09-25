import type {
  InventoryTransaction,
  StocktakeSummary,
  Store,
  StoreProductsResponse,
} from "../types/stocktake";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = await response.json();
      if (Array.isArray(body.message)) {
        message = body.message.join("；");
      } else if (typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      /* 忽略非 JSON 错误体 */
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchStores(): Promise<Store[]> {
  return request<Store[]>("/api/stores");
}

export function fetchStoreProducts(storeId: number): Promise<StoreProductsResponse> {
  return request<StoreProductsResponse>(`/api/stores/${storeId}/products`);
}

export function fetchStocktakes(storeId?: number): Promise<StocktakeSummary[]> {
  const query = storeId ? `?storeId=${storeId}` : "";
  return request<StocktakeSummary[]>(`/api/stocktakes${query}`);
}

export function fetchStocktake(id: number): Promise<StocktakeSummary> {
  return request<StocktakeSummary>(`/api/stocktakes/${id}`);
}

export function startStocktake(
  storeId: number,
  productIds: number[],
  remark?: string,
): Promise<StocktakeSummary> {
  return request<StocktakeSummary>("/api/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId, productIds, remark }),
  });
}

export function saveCounts(
  id: number,
  counts: { itemId: number; countedQty: number }[],
): Promise<StocktakeSummary> {
  return request<StocktakeSummary>(`/api/stocktakes/${id}/counts`, {
    method: "POST",
    body: JSON.stringify({ counts }),
  });
}

export function confirmStocktake(id: number): Promise<StocktakeSummary> {
  return request<StocktakeSummary>(`/api/stocktakes/${id}/confirm`, { method: "POST" });
}

export function cancelStocktake(id: number): Promise<StocktakeSummary> {
  return request<StocktakeSummary>(`/api/stocktakes/${id}/cancel`, { method: "POST" });
}

export function fetchTransactions(storeId: number): Promise<InventoryTransaction[]> {
  return request<InventoryTransaction[]>(`/api/stores/${storeId}/transactions?limit=50`);
}
