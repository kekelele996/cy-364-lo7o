<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  cancelStocktakeOrder,
  completeStocktakeOrder,
  createMovement,
  createStocktakeOrder,
  fetchCatalog,
  fetchStocktakeOrder,
  fetchStocktakeOrders,
  fetchStores,
  saveStocktakeLines,
} from "../api/client";
import type {
  CatalogItem,
  StocktakeLineView,
  StocktakeOrderDetail,
  StocktakeOrderList,
  StocktakeOrderSummary,
  StoreInfo,
} from "../types";

const stores = ref<StoreInfo[]>([]);
const selectedStoreId = ref<number | null>(null);
const catalog = ref<CatalogItem[]>([]);
const orders = ref<StocktakeOrderList>({ inProgress: [], recentFinished: [] });
const operator = ref("店长");
const loading = ref(false);
const loadError = ref("");

const createVisible = ref(false);
const createSelection = ref<CatalogItem[]>([]);
const createRequestKey = ref("");
const createSubmitting = ref(false);

const countVisible = ref(false);
const currentOrder = ref<StocktakeOrderDetail | null>(null);
const countInputs = reactive<Record<number, number | undefined>>({});
const countDirty = ref(false);
const countSaving = ref(false);
const countSubmitting = ref(false);
let suppressAutoSave = false;

const resultVisible = ref(false);
const resultOrder = ref<StocktakeOrderDetail | null>(null);

const movementForm = reactive<{ productId: number | null; direction: "in" | "out"; quantity: number }>({
  productId: null,
  direction: "in",
  quantity: 1,
});
const movementSubmitting = ref(false);

const countedTotal = computed(
  () => currentOrder.value?.lines.filter((line) => countInputs[line.lineId] != null).length ?? 0,
);
const allCounted = computed(
  () => !!currentOrder.value && countedTotal.value === currentOrder.value.lines.length,
);
const previewSurplus = computed(() => sumPreview((diff) => Math.max(diff, 0)));
const previewDeficit = computed(() => sumPreview((diff) => Math.max(-diff, 0)));

function sumPreview(pick: (diff: number) => number) {
  if (!currentOrder.value) return 0;
  return currentOrder.value.lines.reduce((sum, line) => {
    const input = countInputs[line.lineId];
    return input == null ? sum : sum + pick(input - line.bookQuantity);
  }, 0);
}

async function bootstrap() {
  loading.value = true;
  loadError.value = "";
  try {
    stores.value = await fetchStores();
    if (selectedStoreId.value == null && stores.value.length > 0) {
      selectedStoreId.value = stores.value[0].id;
    }
    if (selectedStoreId.value != null) {
      await refreshAll();
    }
  } catch (error) {
    loadError.value = `盘点数据加载失败：${(error as Error).message}`;
  } finally {
    loading.value = false;
  }
}

async function refreshAll() {
  if (selectedStoreId.value == null) return;
  const storeId = selectedStoreId.value;
  const [orderList, catalogItems] = await Promise.all([
    fetchStocktakeOrders(storeId),
    fetchCatalog(storeId),
  ]);
  orders.value = orderList;
  catalog.value = catalogItems;
}

async function refreshAllSafe() {
  try {
    await refreshAll();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function handleStoreChange() {
  void refreshAllSafe();
}

function newRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function openCreateDialog() {
  createRequestKey.value = newRequestKey();
  createSelection.value = [];
  createVisible.value = true;
  await refreshAllSafe();
}

function onSelectionChange(rows: CatalogItem[]) {
  createSelection.value = rows;
}

function isSelectable(row: CatalogItem) {
  return !row.frozen;
}

async function submitCreate() {
  if (selectedStoreId.value == null || createSelection.value.length === 0) return;
  createSubmitting.value = true;
  try {
    const order = await createStocktakeOrder({
      storeId: selectedStoreId.value,
      productIds: createSelection.value.map((item) => item.productId),
      operator: operator.value.trim() || "店长",
      requestKey: createRequestKey.value,
    });
    createVisible.value = false;
    ElMessage.success(`盘点单 ${order.orderNo} 已开始，所选商品库存变动已暂停`);
    await refreshAllSafe();
    await openCountDialog(order.id);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    createSubmitting.value = false;
  }
}

async function openCountDialog(orderId: number) {
  try {
    const detail = await fetchStocktakeOrder(orderId);
    currentOrder.value = detail;
    Object.keys(countInputs).forEach((key) => delete countInputs[Number(key)]);
    for (const line of detail.lines) {
      countInputs[line.lineId] = line.actualQuantity ?? undefined;
    }
    countDirty.value = false;
    suppressAutoSave = false;
    countVisible.value = true;
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function markDirty() {
  countDirty.value = true;
}

function diffOf(line: StocktakeLineView): number | null {
  const input = countInputs[line.lineId];
  return input == null ? null : input - line.bookQuantity;
}

async function saveDraft(showToast: boolean): Promise<boolean> {
  const order = currentOrder.value;
  if (!order) return false;
  const lines = order.lines
    .filter((line) => countInputs[line.lineId] != null)
    .map((line) => ({ productId: line.productId, actualQuantity: countInputs[line.lineId] as number }));
  if (lines.length === 0) {
    if (showToast) ElMessage.info("还没有录入任何实盘数");
    return false;
  }
  countSaving.value = true;
  try {
    const updated = await saveStocktakeLines(order.id, lines);
    currentOrder.value = updated;
    countDirty.value = false;
    if (showToast) ElMessage.success("已暂存，中途退出后可以继续盘点");
    void refreshAllSafe();
    return true;
  } catch (error) {
    ElMessage.error((error as Error).message);
    return false;
  } finally {
    countSaving.value = false;
  }
}

function handleCountClose() {
  const order = currentOrder.value;
  if (countDirty.value && !suppressAutoSave && order?.status === "in_progress") {
    void saveDraft(false).then((ok) => {
      if (ok) ElMessage.info("已自动暂存实盘数，再次进入可继续盘点");
    });
  }
  suppressAutoSave = false;
  currentOrder.value = null;
}

async function submitCount() {
  const order = currentOrder.value;
  if (!order) return;
  const missing = order.lines.filter((line) => countInputs[line.lineId] == null);
  if (missing.length > 0) {
    ElMessage.warning(`还有 ${missing.length} 个商品未录入实盘数`);
    return;
  }
  countSubmitting.value = true;
  try {
    const saved = await saveDraft(false);
    if (!saved && countDirty.value) return;
    const result = await completeStocktakeOrder(order.id);
    suppressAutoSave = true;
    countVisible.value = false;
    resultOrder.value = result;
    resultVisible.value = true;
    ElMessage.success("盘点完成，库存与调整流水已生成");
    await refreshAllSafe();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    countSubmitting.value = false;
  }
}

async function cancelOrderFlow(order: StocktakeOrderSummary | StocktakeOrderDetail) {
  try {
    await ElMessageBox.confirm(
      `确定取消盘点单 ${order.orderNo} 吗？所选商品的库存冻结将立即解除，已录入的实盘数不会生效。`,
      "取消盘点",
      { type: "warning", confirmButtonText: "取消盘点单", cancelButtonText: "再想想" },
    );
  } catch {
    return;
  }
  try {
    await cancelStocktakeOrder(order.id);
    ElMessage.success("盘点单已取消，商品冻结已解除");
    if (currentOrder.value?.id === order.id) {
      suppressAutoSave = true;
      countVisible.value = false;
    }
    await refreshAllSafe();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function cancelCurrentOrder() {
  if (currentOrder.value) {
    void cancelOrderFlow(currentOrder.value);
  }
}

async function viewOrder(order: StocktakeOrderSummary) {
  try {
    resultOrder.value = await fetchStocktakeOrder(order.id);
    resultVisible.value = true;
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function submitMovement() {
  if (selectedStoreId.value == null) return;
  if (movementForm.productId == null) {
    ElMessage.warning("请先选择商品");
    return;
  }
  movementSubmitting.value = true;
  try {
    const result = await createMovement({
      storeId: selectedStoreId.value,
      productId: movementForm.productId,
      direction: movementForm.direction,
      quantity: movementForm.quantity,
      operator: operator.value.trim() || "店长",
    });
    ElMessage.success(
      `${result.productName}${movementForm.direction === "in" ? "入库" : "出库"}成功，当前库存 ${result.balanceAfter}`,
    );
    movementForm.quantity = 1;
    await refreshAllSafe();
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    movementSubmitting.value = false;
  }
}

function statusLabel(status: string) {
  return status === "in_progress" ? "进行中" : status === "completed" ? "已完成" : "已取消";
}

function statusTagType(status: string) {
  return status === "in_progress" ? "warning" : status === "completed" ? "success" : "info";
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDiff(diff: number | null) {
  if (diff == null) return "—";
  if (diff > 0) return `+${diff} 盈`;
  if (diff < 0) return `${diff} 亏`;
  return "0";
}

function diffClass(diff: number | null) {
  if (diff == null || diff === 0) return "diff-none";
  return diff > 0 ? "diff-plus" : "diff-minus";
}

function movementTypeLabel(changeType: string) {
  if (changeType === "stocktake_adjust") return "盘点调整";
  if (changeType === "stock_in") return "入库";
  return "出库";
}

onMounted(bootstrap);
</script>

<template>
  <section class="work-panel stocktake-panel">
    <div class="panel-header">
      <div>
        <h2>门店盘点</h2>
        <p class="panel-subtitle">开始后所选商品库存变动暂停，其他门店不受影响；提交后自动校准库存并生成调整流水。</p>
      </div>
      <div class="panel-actions">
        <el-select
          v-model="selectedStoreId"
          placeholder="选择门店"
          class="store-select"
          @change="handleStoreChange"
        >
          <el-option v-for="store in stores" :key="store.id" :label="store.name" :value="store.id" />
        </el-select>
        <el-input v-model="operator" placeholder="操作员" class="operator-input" />
        <el-button @click="refreshAllSafe">刷新</el-button>
        <el-button type="primary" :disabled="selectedStoreId == null" @click="openCreateDialog">
          开盘点单
        </el-button>
      </div>
    </div>

    <el-alert v-if="loadError" type="error" :closable="false" class="panel-alert">
      <template #title>
        {{ loadError }}
        <el-button size="small" text type="primary" @click="bootstrap">重试</el-button>
      </template>
    </el-alert>

    <template v-else>
      <h3 class="section-title">进行中的盘点</h3>
      <el-table v-loading="loading" :data="orders.inProgress" empty-text="暂无进行中的盘点单">
        <el-table-column prop="orderNo" label="盘点单号" min-width="170" />
        <el-table-column label="商品数" width="80" align="right">
          <template #default="{ row }">{{ row.totalLines }}</template>
        </el-table-column>
        <el-table-column label="已录入" width="80" align="right">
          <template #default="{ row }">{{ row.countedLines }}</template>
        </el-table-column>
        <el-table-column prop="operator" label="操作员" width="100" />
        <el-table-column label="开始时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openCountDialog(row.id)">继续盘点</el-button>
            <el-button size="small" type="danger" text @click="cancelOrderFlow(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>

      <h3 class="section-title">最近完成的盘点</h3>
      <el-table :data="orders.recentFinished" empty-text="暂无已结束的盘点单">
        <el-table-column prop="orderNo" label="盘点单号" min-width="170" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="商品数" width="80" align="right">
          <template #default="{ row }">{{ row.totalLines }}</template>
        </el-table-column>
        <el-table-column label="盘盈" width="80" align="right">
          <template #default="{ row }"><span class="diff-plus">+{{ row.surplus }}</span></template>
        </el-table-column>
        <el-table-column label="盘亏" width="80" align="right">
          <template #default="{ row }"><span class="diff-minus">-{{ row.deficit }}</span></template>
        </el-table-column>
        <el-table-column label="结束时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.completedAt ?? row.cancelledAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="viewOrder(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="movement-card">
        <h3 class="section-title">库存出入库</h3>
        <div class="movement-form">
          <el-select v-model="movementForm.productId" placeholder="选择商品" filterable class="movement-product">
            <el-option
              v-for="item in catalog"
              :key="item.productId"
              :value="item.productId"
              :label="`${item.name}（库存 ${item.quantity}${item.frozen ? ' · 盘点中' : ''}）`"
            />
          </el-select>
          <el-radio-group v-model="movementForm.direction">
            <el-radio-button value="in">入库</el-radio-button>
            <el-radio-button value="out">出库</el-radio-button>
          </el-radio-group>
          <el-input-number v-model="movementForm.quantity" :min="1" :max="100000" />
          <el-button type="primary" :loading="movementSubmitting" @click="submitMovement">提交变动</el-button>
        </div>
        <p class="movement-hint">盘点中的商品会被拒绝出入库，可用来验证冻结是否生效。</p>
      </div>
    </template>

    <el-dialog v-model="createVisible" title="开盘点单" width="760px">
      <p class="dialog-tip">选择要盘点的商品，开始后这些商品在本门店的库存变动将暂停，直到提交或取消。</p>
      <el-table :data="catalog" height="360" row-key="productId" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="46" :selectable="isSelectable" />
        <el-table-column prop="sku" label="SKU" width="110" />
        <el-table-column prop="name" label="商品" min-width="140" />
        <el-table-column prop="spec" label="规格" width="130" />
        <el-table-column prop="quantity" label="当前库存" width="90" align="right" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.frozen" type="warning" size="small">盘点中</el-tag>
            <el-tag v-else type="success" size="small">正常</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <span class="dialog-footer-tip">已选 {{ createSelection.length }} 个商品</span>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="createSelection.length === 0"
          :loading="createSubmitting"
          @click="submitCreate"
        >
          开始盘点
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="countVisible"
      :title="`盘点录入 · ${currentOrder?.orderNo ?? ''}`"
      width="780px"
      :close-on-click-modal="false"
      @close="handleCountClose"
    >
      <template v-if="currentOrder">
        <p class="dialog-tip">账面数为开盘点单时的快照；关闭窗口会自动暂存，再次进入可继续。</p>
        <el-table :data="currentOrder.lines" height="380">
          <el-table-column label="商品" min-width="180">
            <template #default="{ row }">
              {{ row.name }} <span class="line-sku">{{ row.sku }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="bookQuantity" label="账面数" width="90" align="right" />
          <el-table-column label="实盘数" width="180">
            <template #default="{ row }">
              <el-input-number
                v-model="countInputs[row.lineId]"
                :min="0"
                :precision="0"
                placeholder="输入实盘数"
                size="small"
                @change="markDirty"
              />
            </template>
          </el-table-column>
          <el-table-column label="差异" width="110" align="right">
            <template #default="{ row }">
              <span :class="diffClass(diffOf(row))">{{ formatDiff(diffOf(row)) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="count-summary">
          已录入 {{ countedTotal }}/{{ currentOrder.lines.length }} · 预计盘盈
          <span class="diff-plus">+{{ previewSurplus }}</span> · 预计盘亏
          <span class="diff-minus">-{{ previewDeficit }}</span>
        </div>
      </template>
      <template #footer>
        <el-button type="danger" plain @click="cancelCurrentOrder">取消盘点单</el-button>
        <el-button :loading="countSaving" @click="saveDraft(true)">暂存</el-button>
        <el-button type="primary" :disabled="!allCounted" :loading="countSubmitting" @click="submitCount">
          提交盘点
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultVisible" :title="`盘点结果 · ${resultOrder?.orderNo ?? ''}`" width="780px">
      <template v-if="resultOrder">
        <div class="result-summary">
          <el-tag :type="statusTagType(resultOrder.status)">{{ statusLabel(resultOrder.status) }}</el-tag>
          <span>操作员：{{ resultOrder.operator }}</span>
          <span>盘盈 <b class="diff-plus">+{{ resultOrder.surplus }}</b></span>
          <span>盘亏 <b class="diff-minus">-{{ resultOrder.deficit }}</b></span>
        </div>
        <el-table :data="resultOrder.lines" height="300">
          <el-table-column label="商品" min-width="170">
            <template #default="{ row }">
              {{ row.name }} <span class="line-sku">{{ row.sku }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="bookQuantity" label="账面数" width="90" align="right" />
          <el-table-column label="实盘数" width="90" align="right">
            <template #default="{ row }">{{ row.actualQuantity ?? "—" }}</template>
          </el-table-column>
          <el-table-column label="差异" width="110" align="right">
            <template #default="{ row }">
              <span :class="diffClass(row.difference)">{{ formatDiff(row.difference) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <template v-if="resultOrder.movements.length > 0">
          <h4 class="section-title">调整流水</h4>
          <el-table :data="resultOrder.movements" size="small">
            <el-table-column prop="productName" label="商品" min-width="140" />
            <el-table-column label="类型" width="100">
              <template #default="{ row }">{{ movementTypeLabel(row.changeType) }}</template>
            </el-table-column>
            <el-table-column label="调整数量" width="100" align="right">
              <template #default="{ row }">
                <span :class="diffClass(row.quantity)">{{ row.quantity > 0 ? `+${row.quantity}` : row.quantity }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="balanceAfter" label="调整后库存" width="100" align="right" />
            <el-table-column label="时间" min-width="150">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </template>
      <template #footer>
        <el-button type="primary" @click="resultVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </section>
</template>
