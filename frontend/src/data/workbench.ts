import type { FeatureItem, KpiItem, OperationRecord } from "../types";

export const localFeatures: FeatureItem[] = [
  {
    "id": 1,
    "title": "多门店SKU统一管理",
    "description": "总部维护商品SKU主数据（名称、规格、条码、分类），各门店关联本地库存，支持批量导入和修改。",
    "status": "已上线",
    "metric": "88%"
  },
  {
    "id": 2,
    "title": "库存实时同步与预警",
    "description": "各门店库存变动实时同步，设置安全库存阈值，低于阈值时自动触发补货预警通知店长。",
    "status": "排期中",
    "metric": "31 单"
  },
  {
    "id": 3,
    "title": "调拨申请与审批",
    "description": "门店间发起库存调拨申请，填写调拨数量和原因，目标门店确认收货后完成调拨，全程留痕可追溯。",
    "status": "巡检中",
    "metric": "10 项"
  },
  {
    "id": 4,
    "title": "出入库记录与盘点",
    "description": "记录每次入库（采购/调拨）和出库（销售/损耗）明细，支持周期性库存盘点，自动计算盘盈盘亏。",
    "status": "优化中",
    "metric": "4 级"
  },
  {
    "id": 5,
    "title": "滞销品分析与补货建议",
    "description": "按销量排名分析各门店滞销商品，生成智能补货建议报表，辅助采购决策。",
    "status": "可导出",
    "metric": "28 条"
  }
];

export const localKpis: KpiItem[] = [
  {
    "label": "今日处理",
    "value": "102",
    "trend": "+12%",
    "tone": "primary"
  },
  {
    "label": "预约/订单",
    "value": "37",
    "trend": "+8%",
    "tone": "warm"
  },
  {
    "label": "履约率",
    "value": "89%",
    "trend": "+3%",
    "tone": "cool"
  },
  {
    "label": "待处理",
    "value": "8",
    "trend": "需跟进",
    "tone": "neutral"
  }
];

export const operationRecords: OperationRecord[] = [
  {
    "key": "ldstoreinventory-1",
    "name": "多门店SKU统一管理",
    "owner": "运营组",
    "status": "已上线",
    "metric": "88%",
    "priority": "高"
  },
  {
    "key": "ldstoreinventory-2",
    "name": "库存实时同步与预警",
    "owner": "管理员",
    "status": "排期中",
    "metric": "31 单",
    "priority": "中"
  },
  {
    "key": "ldstoreinventory-3",
    "name": "调拨申请与审批",
    "owner": "服务台",
    "status": "巡检中",
    "metric": "10 项",
    "priority": "低"
  },
  {
    "key": "ldstoreinventory-4",
    "name": "出入库记录与盘点",
    "owner": "财务组",
    "status": "优化中",
    "metric": "4 级",
    "priority": "高"
  },
  {
    "key": "ldstoreinventory-5",
    "name": "滞销品分析与补货建议",
    "owner": "审核组",
    "status": "可导出",
    "metric": "28 条",
    "priority": "中"
  }
];
