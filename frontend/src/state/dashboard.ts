import { localFeatures, localKpis, operationRecords } from "../data/workbench";
import type { OverviewResponse } from "../types";
import { APP_CODE, APP_NAME } from "../constants/app";

export function createFallbackOverview(): OverviewResponse {
  return {
    appName: APP_NAME,
    appCode: APP_CODE,
    description: "面向连锁零售企业，提供多门店库存统一管理、智能调拨和出入库追踪，解决门店间库存不均与缺货问题。",
    features: localFeatures,
    kpis: localKpis,
    records: operationRecords,
  };
}
