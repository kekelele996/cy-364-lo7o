import { API_BASE_URL } from "../constants/app";
import type {
  CatalogItem,
  MovementResult,
  OverviewResponse,
  StocktakeOrderDetail,
  StocktakeOrderList,
  StoreInfo,
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message) ? body.message.join("；") : body.message;
      }
    } catch {
      // 保留默认错误信息
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchOverview(): Promise<OverviewResponse> {
  return request<OverviewResponse>("/overview");
}

export function fetchStores(): Promise<StoreInfo[]> {
  return request<StoreInfo[]>("/inventory/stores");
}

export function fetchCatalog(storeId: number): Promise<CatalogItem[]> {
  return request<CatalogItem[]>(`/inventory/stores/${storeId}/catalog`);
}

export function createMovement(payload: {
  storeId: number;
  productId: number;
  direction: "in" | "out";
  quantity: number;
  operator: string;
}): Promise<MovementResult> {
  return request<MovementResult>("/inventory/movements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchStocktakeOrders(storeId: number): Promise<StocktakeOrderList> {
  return request<StocktakeOrderList>(`/stocktake/orders?storeId=${storeId}`);
}

export function fetchStocktakeOrder(orderId: number): Promise<StocktakeOrderDetail> {
  return request<StocktakeOrderDetail>(`/stocktake/orders/${orderId}`);
}

export function createStocktakeOrder(payload: {
  storeId: number;
  productIds: number[];
  operator: string;
  requestKey: string;
}): Promise<StocktakeOrderDetail> {
  return request<StocktakeOrderDetail>("/stocktake/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveStocktakeLines(
  orderId: number,
  lines: { productId: number; actualQuantity: number }[],
): Promise<StocktakeOrderDetail> {
  return request<StocktakeOrderDetail>(`/stocktake/orders/${orderId}/lines`, {
    method: "PATCH",
    body: JSON.stringify({ lines }),
  });
}

export function completeStocktakeOrder(orderId: number): Promise<StocktakeOrderDetail> {
  return request<StocktakeOrderDetail>(`/stocktake/orders/${orderId}/complete`, {
    method: "POST",
  });
}

export function cancelStocktakeOrder(orderId: number): Promise<StocktakeOrderDetail> {
  return request<StocktakeOrderDetail>(`/stocktake/orders/${orderId}/cancel`, {
    method: "POST",
  });
}
