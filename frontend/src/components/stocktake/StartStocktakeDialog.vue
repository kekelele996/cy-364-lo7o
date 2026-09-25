<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { StoreProduct } from "../../types/stocktake";

const props = defineProps<{
  modelValue: boolean;
  products: StoreProduct[];
  starting: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "start", productIds: number[], remark: string): void;
}>();

const selectedIds = ref<number[]>([]);
const remark = ref("");
const selectAll = ref(false);
const formError = ref("");

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      selectedIds.value = [];
      remark.value = "";
      selectAll.value = false;
      formError.value = "";
    }
  },
);

const selectedSet = computed(() => new Set(selectedIds.value));
const allSelected = computed(
  () => props.products.length > 0 && selectedIds.value.length === props.products.length,
);

function toggleProduct(productId: number) {
  if (selectedSet.value.has(productId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== productId);
  } else {
    selectedIds.value = [...selectedIds.value, productId];
  }
}

watch(allSelected, (value) => {
  selectAll.value = value;
});

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = props.products.map((product) => product.productId);
  }
}

function handleClose() {
  emit("update:modelValue", false);
}

function handleSubmit() {
  if (selectedIds.value.length === 0) {
    formError.value = "请至少选择一个商品";
    return;
  }
  emit("start", [...selectedIds.value], remark.value.trim());
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="新建盘点单"
    width="760px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div class="select-head">
      <el-checkbox :model-value="allSelected" @change="toggleAll">
        全选（已选 {{ selectedIds.length }} / {{ products.length }}）
      </el-checkbox>
      <span class="hint">点击商品行即可勾选；开始后这些商品的库存变动将暂停</span>
    </div>
    <el-table
      :data="products"
      height="320"
      border
      size="small"
      class="product-table"
      :row-class-name="() => 'pick-row'"
      @row-click="(row: StoreProduct) => toggleProduct(row.productId)"
    >
      <el-table-column width="46" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="selectedSet.has(row.productId)"
            @click.stop
            @change="toggleProduct(row.productId)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="sku" label="SKU" width="110" />
      <el-table-column prop="name" label="商品名称" min-width="150" />
      <el-table-column prop="spec" label="规格" width="130" />
      <el-table-column prop="category" label="分类" width="80" />
      <el-table-column label="当前库存" width="100" align="right">
        <template #default="{ row }">
          {{ row.quantity }} {{ row.unit }}
        </template>
      </el-table-column>
    </el-table>
    <div v-if="formError" class="form-error">{{ formError }}</div>

    <div class="remark-block">
      <label>备注（可选）</label>
      <el-input
        v-model="remark"
        maxlength="200"
        show-word-limit
        placeholder="例如：月末例行盘点"
      />
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="starting"
        :disabled="selectedIds.length === 0"
        @click="handleSubmit"
      >
        开始盘点
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.select-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.hint {
  font-size: 12px;
  color: #8a8f7d;
}

.product-table :deep(.pick-row) {
  cursor: pointer;
}

.form-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 6px;
}

.remark-block {
  margin-top: 16px;
}

.remark-block label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}
</style>
