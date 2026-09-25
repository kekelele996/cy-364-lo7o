<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { fetchTransactions } from "../../api/stocktake";
import type { InventoryTransaction } from "../../types/stocktake";

const props = defineProps<{
  modelValue: boolean;
  storeId: number | null;
  storeName: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const transactions = ref<InventoryTransaction[]>([]);
const loading = ref(false);

watch(
  () => [props.modelValue, props.storeId] as const,
  async ([visible, storeId]) => {
    if (visible && storeId) {
      loading.value = true;
      try {
        transactions.value = await fetchTransactions(storeId);
      } catch (error) {
        ElMessage.error((error as Error).message);
      } finally {
        loading.value = false;
      }
    }
  },
  { immediate: true },
);

function tagType(type: InventoryTransaction["type"]) {
  if (type === "INBOUND") return "success";
  if (type === "OUTBOUND") return "warning";
  return "danger";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    :title="`库存流水 · ${storeName}`"
    size="780px"
    @close="emit('update:modelValue', false)"
  >
    <el-table :data="transactions" v-loading="loading" size="small" stripe>
      <el-table-column label="类型" width="92">
        <template #default="{ row }">
          <el-tag :type="tagType(row.type)" size="small">{{ row.typeLabel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="productName" label="商品" min-width="140" />
      <el-table-column label="变动" width="90" align="right">
        <template #default="{ row }">
          <span :class="row.changeQty >= 0 ? 'qty-up' : 'qty-down'">
            {{ row.changeQty > 0 ? "+" : "" }}{{ row.changeQty }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="balance" label="结余" width="80" align="right" />
      <el-table-column prop="reason" label="原因" min-width="100" />
      <el-table-column prop="refCode" label="关联单号" width="140">
        <template #default="{ row }">{{ row.refCode ?? "-" }}</template>
      </el-table-column>
      <el-table-column label="时间" min-width="160">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
  </el-drawer>
</template>

<style scoped>
.qty-up {
  color: #7d8f2d;
  font-weight: 700;
}
.qty-down {
  color: #b55239;
  font-weight: 700;
}
</style>
