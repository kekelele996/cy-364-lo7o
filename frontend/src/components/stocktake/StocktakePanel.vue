<script setup lang="ts">
import type { StocktakeSummary } from "../../types/stocktake";

defineProps<{
  stocktakes: StocktakeSummary[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: "open", stocktake: StocktakeSummary): void;
  (e: "refresh"): void;
}>();

function tagType(status: StocktakeSummary["status"]) {
  if (status === "IN_PROGRESS") return "warning";
  if (status === "COMPLETED") return "success";
  return "info";
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatVariance(value: number | null): string {
  if (value === null) return "—";
  if (value > 0) return `+${value}`;
  return String(value);
}
</script>

<template>
  <el-card shadow="never" class="stocktake-panel">
    <template #header>
      <div class="panel-head">
        <div>
          <h3>门店盘点</h3>
          <p>进行中的盘点会暂停对应商品的库存变动；完成或取消后自动恢复</p>
        </div>
        <el-button :loading="loading" @click="emit('refresh')">刷新</el-button>
      </div>
    </template>

    <el-table
      :data="stocktakes"
      v-loading="loading"
      size="small"
      stripe
      @row-click="(row: StocktakeSummary) => emit('open', row)"
      :row-class-name="() => 'clickable-row'"
      empty-text="暂无盘点单，选择门店后点击「开始盘点」"
    >
      <el-table-column prop="code" label="盘点单号" width="140" />
      <el-table-column prop="storeName" label="门店" width="130" />
      <el-table-column label="状态" width="92">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)" size="small">{{ row.statusLabel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="录入进度" width="100">
        <template #default="{ row }">{{ row.countedCount }}/{{ row.itemCount }}</template>
      </el-table-column>
      <el-table-column label="总盘盈/盘亏" width="110" align="right">
        <template #default="{ row }">
          <span :class="row.totalVariance === null ? '' : row.totalVariance > 0 ? 'var-up' : row.totalVariance < 0 ? 'var-down' : 'var-flat'">
            {{ formatVariance(row.totalVariance) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" min-width="160">
        <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
      </el-table-column>
      <el-table-column label="完成时间" min-width="160">
        <template #default="{ row }">{{ formatTime(row.finishedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="emit('open', row)">
            {{ row.status === "IN_PROGRESS" ? "继续" : "查看" }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
.stocktake-panel {
  margin-top: 22px;
  border-radius: 8px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-head h3 {
  margin: 0;
  font-size: 17px;
}

.panel-head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a8f7d;
}

:deep(.clickable-row) {
  cursor: pointer;
}

.var-up {
  color: #b55239;
  font-weight: 700;
}

.var-down {
  color: #c0392b;
  font-weight: 700;
}

.var-flat {
  color: #7d8f2d;
  font-weight: 700;
}
</style>
