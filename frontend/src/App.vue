<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { APP_CODE, APP_NAME } from "./constants/app";
import {
  fetchStocktake,
  fetchStocktakes,
  fetchStoreProducts,
  fetchStores,
  startStocktake,
} from "./api/stocktake";
import type {
  StocktakeSummary,
  Store,
  StoreProduct,
} from "./types/stocktake";
import StartStocktakeDialog from "./components/stocktake/StartStocktakeDialog.vue";
import CountEntryDialog from "./components/stocktake/CountEntryDialog.vue";
import StocktakePanel from "./components/stocktake/StocktakePanel.vue";
import TransactionDrawer from "./components/stocktake/TransactionDrawer.vue";

const stores = ref<Store[]>([]);
const selectedStoreId = ref<number | null>(null);
const storeProducts = ref<StoreProduct[]>([]);
const pausedStocktakeId = ref<number | null>(null);

const stocktakes = ref<StocktakeSummary[]>([]);
const loadingList = ref(false);
const starting = ref(false);

const startDialogVisible = ref(false);
const countDialogVisible = ref(false);
const activeStocktake = ref<StocktakeSummary | null>(null);
const txDrawerVisible = ref(false);

const currentStore = computed(() =>
  stores.value.find((store) => store.id === selectedStoreId.value) ?? null,
);
const pausedProducts = computed(() => storeProducts.value.filter((product) => product.paused));

async function loadStores() {
  stores.value = await fetchStores();
  if (stores.value.length > 0) {
    selectedStoreId.value = stores.value[0].id;
    await loadStoreProducts();
  }
}

async function loadStoreProducts() {
  if (!selectedStoreId.value) return;
  const data = await fetchStoreProducts(selectedStoreId.value);
  storeProducts.value = data.products;
  pausedStocktakeId.value = data.pausedStocktakeId;
}

async function loadStocktakes() {
  loadingList.value = true;
  try {
    stocktakes.value = await fetchStocktakes();
  } finally {
    loadingList.value = false;
  }
}

async function refreshAll() {
  try {
    await Promise.all([loadStoreProducts(), loadStocktakes()]);
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function handleStoreChange() {
  try {
    await loadStoreProducts();
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

function openStartDialog() {
  startDialogVisible.value = true;
}

async function handleStart(productIds: number[], remark: string) {
  if (!selectedStoreId.value) return;
  starting.value = true;
  try {
    const stocktake = await startStocktake(selectedStoreId.value, productIds, remark || undefined);
    startDialogVisible.value = false;
    ElMessage.success(`盘点单 ${stocktake.code} 已开始，相关商品库存变动已暂停`);
    await refreshAll();
    await openStocktake(stocktake.id);
  } catch (error) {
    ElMessage.error((error as Error).message);
  } finally {
    starting.value = false;
  }
}

async function openStocktake(idOrRow: number | StocktakeSummary) {
  try {
    const stocktake =
      typeof idOrRow === "number" ? await fetchStocktake(idOrRow) : idOrRow;
    // 打开其他门店的盘点单时同步门店选择，方便上下文一致
    selectedStoreId.value = stocktake.storeId;
    await loadStoreProducts();
    activeStocktake.value = stocktake;
    countDialogVisible.value = true;
  } catch (error) {
    ElMessage.error((error as Error).message);
  }
}

async function handleStocktakeChanged(updated: StocktakeSummary) {
  activeStocktake.value = updated;
  const index = stocktakes.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) {
    stocktakes.value[index] = updated;
  } else {
    stocktakes.value.unshift(updated);
  }
  await loadStoreProducts();
}

async function quickResumePaused() {
  if (!pausedStocktakeId.value) return;
  await openStocktake(pausedStocktakeId.value);
}

onMounted(async () => {
  try {
    await loadStores();
    await loadStocktakes();
  } catch (error) {
    ElMessage.error(`加载失败：${(error as Error).message}`);
  }
});
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <span class="brand-code">{{ APP_CODE }}</span>
        <h1 class="brand-title">{{ APP_NAME }}</h1>
      </div>
      <div class="topbar-actions">
        <el-select
          v-model="selectedStoreId"
          placeholder="选择门店"
          style="width: 200px"
          @change="handleStoreChange"
        >
          <el-option
            v-for="store in stores"
            :key="store.id"
            :label="`${store.name}（${store.manager}）`"
            :value="store.id"
          />
        </el-select>
        <el-button @click="txDrawerVisible = true" :disabled="!selectedStoreId">库存流水</el-button>
        <el-button type="primary" :disabled="!selectedStoreId" @click="openStartDialog">
          开始盘点
        </el-button>
      </div>
    </header>

    <section class="workspace">
      <el-alert
        v-if="pausedStocktakeId"
        class="pause-banner"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #title>
          当前门店有 {{ pausedProducts.length }} 个商品正在盘点，库存变动已暂停，其他商品与门店不受影响
          <el-button link type="primary" class="resume-link" @click="quickResumePaused">
            继续盘点 →
          </el-button>
        </template>
      </el-alert>

      <el-card shadow="never" class="inventory-card">
        <template #header>
          <div class="panel-head">
            <div>
              <h3>{{ currentStore?.name ?? "门店商品库存" }}</h3>
              <p>勾选商品后点击顶部「开始盘点」，系统会记录开始时的账面数</p>
            </div>
          </div>
        </template>
        <el-table :data="storeProducts" size="small" stripe>
          <el-table-column prop="sku" label="SKU" width="110" />
          <el-table-column prop="name" label="商品名称" min-width="150" />
          <el-table-column prop="spec" label="规格" width="130" />
          <el-table-column prop="category" label="分类" width="90" />
          <el-table-column label="库存数量" width="110" align="right">
            <template #default="{ row }">
              <span :class="{ 'qty-warn': row.quantity <= row.safetyQty }">
                {{ row.quantity }} {{ row.unit }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="安全库存" width="100" align="right">
            <template #default="{ row }">{{ row.safetyQty }}</template>
          </el-table-column>
          <el-table-column label="盘点状态" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.paused" type="warning" size="small">盘点暂停中</el-tag>
              <el-tag v-else type="success" size="small" effect="plain">正常</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <StocktakePanel
        :stocktakes="stocktakes"
        :loading="loadingList"
        @open="openStocktake"
        @refresh="refreshAll"
      />
    </section>

    <StartStocktakeDialog
      v-model="startDialogVisible"
      :products="storeProducts"
      :starting="starting"
      @start="handleStart"
    />
    <CountEntryDialog
      v-model="countDialogVisible"
      :stocktake="activeStocktake"
      @changed="handleStocktakeChanged"
    />
    <TransactionDrawer
      v-model="txDrawerVisible"
      :store-id="selectedStoreId"
      :store-name="currentStore?.name ?? ''"
    />
  </main>
</template>

<style scoped>
.topbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.workspace {
  width: min(1240px, calc(100vw - 32px));
  margin: 0 auto;
  padding: clamp(20px, 4vw, 36px) 0 64px;
}

.pause-banner {
  margin-bottom: 18px;
  border-radius: 8px;
}

.resume-link {
  margin-left: 8px;
}

.inventory-card {
  border-radius: 8px;
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

.qty-warn {
  color: #b55239;
  font-weight: 700;
}
</style>
