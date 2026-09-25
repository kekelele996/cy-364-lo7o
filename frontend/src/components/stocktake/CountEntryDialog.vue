<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { StocktakeSummary } from "../../types/stocktake";
import { cancelStocktake, confirmStocktake, saveCounts } from "../../api/stocktake";

const props = defineProps<{
  modelValue: boolean;
  stocktake: StocktakeSummary | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "changed", stocktake: StocktakeSummary): void;
}>();

const drafts = ref<Record<number, number>>({});
const saving = ref(false);
const confirming = ref(false);
const cancelling = ref(false);

watch(
  () => props.stocktake,
  (stocktake) => {
    if (stocktake) {
      drafts.value = {};
      for (const item of stocktake.items ?? []) {
        if (item.countedQty !== null) {
          drafts.value[item.itemId] = item.countedQty;
        }
      }
    }
  },
  { immediate: true },
);

const items = computed(() => props.stocktake?.items ?? []);
const inProgress = computed(() => props.stocktake?.status === "IN_PROGRESS");
const countedSet = computed(
  () => new Set(items.value.filter((i) => i.countedQty !== null).map((i) => i.itemId)),
);
const filledDrafts = computed(() =>
  Object.entries(drafts.value)
    .filter(([, value]) => value !== undefined && value !== null && Number.isFinite(Number(value)))
    .map(([itemId, countedQty]) => ({ itemId: Number(itemId), countedQty: Number(countedQty) })),
);
const pendingCount = computed(() => items.value.length - filledDrafts.value.length);

function formatVariance(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value > 0) return `+${value} 盘盈`;
  if (value < 0) return `${value} 盘亏`;
  return "0 相符";
}

function varianceClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "variance-na";
  if (value > 0) return "variance-up";
  if (value < 0) return "variance-down";
  return "variance-flat";
}

function draftVariance(item: (typeof items.value)[number]): number | null {
  const value = drafts.value[item.itemId];
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return Number(value) - item.bookQuantity;
}

function close() {
  emit("update:modelValue", false);
}

async function handleSave() {
  if (!props.stocktake || filledDrafts.value.length === 0) {
    ElMessage.warning("请先填写实盘数");
    return;
  }
  saving.value = true;
  try {
    const updated = await saveCounts(props.stocktake.id, filledDrafts.value);
    emit("changed", updated);
    ElMessage.success(`已暂存 ${filledDrafts.value.length} 条实盘数，可随时退出后继续`);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    saving.value = false;
  }
}

async function handleConfirm() {
  if (!props.stocktake) return;
  if (filledDrafts.value.length < items.value.length) {
    ElMessage.warning(`还有 ${items.value.length - filledDrafts.value.length} 个商品未填写实盘数`);
    return;
  }
  try {
    await ElMessageBox.confirm(
      "确认后将按开始时的账面数一次性更新库存并生成调整流水，且重复提交不会产生重复调整。是否继续？",
      "确认盘点结果",
      { type: "warning", confirmButtonText: "确认盘点", cancelButtonText: "再核对一下" },
    );
  } catch {
    return;
  }

  confirming.value = true;
  try {
    // 先确保最新填写已暂存，再确认（后端在一个事务内完成，失败不留半成品）
    if (filledDrafts.value.length > 0) {
      const saved = await saveCounts(props.stocktake.id, filledDrafts.value);
      emit("changed", saved);
    }
    const result = await confirmStocktake(props.stocktake.id);
    emit("changed", result);
    ElMessage.success("盘点完成，库存已更新");
    emit("update:modelValue", false);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    confirming.value = false;
  }
}

async function handleCancelStocktake() {
  if (!props.stocktake) return;
  try {
    await ElMessageBox.confirm(
      "取消后该盘点单涉及商品的库存暂停将解除，已录入的实盘数会保留留痕。确定取消？",
      "取消盘点",
      { type: "warning", confirmButtonText: "确认取消盘点", cancelButtonText: "继续盘点" },
    );
  } catch {
    return;
  }

  cancelling.value = true;
  try {
    const result = await cancelStocktake(props.stocktake.id);
    emit("changed", result);
    ElMessage.success("已取消盘点，库存暂停已解除");
    emit("update:modelValue", false);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    cancelling.value = false;
  }
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <el-dialog
    v-if="stocktake"
    :model-value="modelValue"
    :title="`盘点单 ${stocktake.code} · ${stocktake.storeName}`"
    width="900px"
    :close-on-click-modal="false"
    @close="close"
  >
    <div class="meta-row">
      <el-tag :type="stocktake.status === 'IN_PROGRESS' ? 'warning' : stocktake.status === 'COMPLETED' ? 'success' : 'info'">
        {{ stocktake.statusLabel }}
      </el-tag>
      <span>开始：{{ formatTime(stocktake.startedAt) }}</span>
      <span v-if="stocktake.finishedAt">结束：{{ formatTime(stocktake.finishedAt) }}</span>
      <span>录入进度：{{ stocktake.countedCount }}/{{ stocktake.itemCount }}</span>
    </div>

    <el-table :data="items" border size="small" class="count-table">
      <el-table-column prop="sku" label="SKU" width="100" />
      <el-table-column prop="name" label="商品名称" min-width="140" />
      <el-table-column prop="spec" label="规格" width="120" />
      <el-table-column label="账面数" width="90" align="right">
        <template #default="{ row }">
          <strong>{{ row.bookQuantity }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="实盘数" width="140" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="inProgress"
            v-model="drafts[row.itemId]"
            :min="0"
            :step="1"
            controls-position="right"
            size="small"
            class="count-input"
            :placeholder="countedSet.has(row.itemId) ? '' : '未录入'"
          />
          <span v-else>{{ row.countedQty ?? "-" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="盘盈/盘亏" width="110" align="right">
        <template #default="{ row }">
          <template v-if="stocktake.status === 'COMPLETED'">
            <span :class="varianceClass(row.variance)">{{ formatVariance(row.variance) }}</span>
          </template>
          <template v-else>
            <span :class="varianceClass(draftVariance(row))">{{ formatVariance(draftVariance(row)) }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="单位" width="60" align="center">
        <template #default="{ row }">{{ row.unit }}</template>
      </el-table-column>
    </el-table>

    <div v-if="stocktake.status === 'COMPLETED'" class="result-banner">
      盘点已完成，合计差异
      <span :class="varianceClass(stocktake.totalVariance)">
        {{ formatVariance(stocktake.totalVariance) }}
      </span>
      ，库存与调整流水已更新。重复进入看到的是同一结果。
    </div>

    <template #footer>
      <template v-if="inProgress">
        <el-button :loading="cancelling" @click="handleCancelStocktake">取消盘点（解除暂停）</el-button>
        <el-button :loading="saving" @click="handleSave">暂存并稍后继续</el-button>
        <el-button type="primary" :loading="confirming" @click="handleConfirm">
          确认盘点（{{ pendingCount === 0 ? "可提交" : `缺 ${pendingCount} 项` }}）
        </el-button>
      </template>
      <el-button v-else @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.meta-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  font-size: 13px;
  color: #5c604f;
  flex-wrap: wrap;
}

.count-table {
  width: 100%;
}

.count-input {
  width: 120px;
}

.variance-up {
  color: #b55239;
  font-weight: 700;
}

.variance-down {
  color: #c0392b;
  font-weight: 700;
}

.variance-flat {
  color: #7d8f2d;
  font-weight: 700;
}

.variance-na {
  color: #a6aa98;
}

.result-banner {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 6px;
  background: color-mix(in srgb, #7d8f2d 12%, transparent);
  font-size: 13px;
}
</style>
