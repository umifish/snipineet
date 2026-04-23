<template>
  <div class="page">
    <div class="mock-banner">MOCK版本：收款 R001~R007，应收 P001~P009</div>
    <div class="toolbar">
      <el-button type="primary" @click="onAutoMatch">一键匹配</el-button>
      <el-button
        type="success"
        :loading="submitting"
        :disabled="matchResult.pairs.length === 0"
        @click="onSubmitMatchedDetails"
      >
        提交核销
      </el-button>
      <el-switch
        v-model="onlySelectedPayables"
        inline-prompt
        active-text="仅匹配已勾选应付"
        inactive-text="匹配当前客户全部应付"
      />
      <el-switch
        v-model="sortPayablesByDate"
        inline-prompt
        active-text="按应付日期排序"
        inactive-text="按原顺序匹配"
      />
      <el-radio-group v-if="sortPayablesByDate" v-model="payableDateOrder" size="small">
        <el-radio-button label="asc">日期升序</el-radio-button>
        <el-radio-button label="desc">日期降序</el-radio-button>
      </el-radio-group>
      <el-tag v-if="activeCustomerCode" type="success">
        当前客户：{{ activeCustomerCode }}
      </el-tag>
      <el-tag type="info">应付总数：{{ payables.length }}</el-tag>
      <el-tag type="info">应付可见数：{{ visiblePayables.length }}</el-tag>
      <el-tag type="info">收款剩余：{{ matchResult.unmatchedReceiptAmount }}</el-tag>
      <el-tag type="warning">应付剩余：{{ matchResult.unmatchedPayableAmount }}</el-tag>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <h3>收款单</h3>
        <el-table
          ref="receiptTableRef"
          :data="receipts"
          row-key="id"
          :reserve-selection="true"
          border
          height="420"
          @selection-change="onReceiptSelectionChange"
        >
          <el-table-column type="selection" width="50" :selectable="canSelectReceipt" />
          <el-table-column prop="id" label="单号" width="90" />
          <el-table-column prop="customerCode" label="客户编号" width="120" />
          <el-table-column prop="customerName" label="客户名称" width="120" />
          <el-table-column prop="totalAmount" label="收款金额" width="90" />
          <el-table-column prop="writtenOffAmount" label="已核销" width="90" />
          <el-table-column prop="pendingAmount" label="待核销" width="90" />
          <el-table-column label="本次核销金额" min-width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.currentAmount"
                :min="0"
                :max="row.pendingAmount"
                :precision="2"
                :step="10"
                controls-position="right"
                style="width: 120px"
              />
            </template>
          </el-table-column>
        </el-table>
      </el-col>

      <el-col :span="12">
        <h3>应付账款</h3>
        <div class="debug-line">
          调试列表：
          <span v-if="visiblePayables.length === 0">空</span>
          <span v-else>{{ visiblePayables.map((x) => x.id).join(", ") }}</span>
        </div>
        <el-table
          ref="payableTableRef"
          :data="visiblePayables"
          row-key="id"
          :reserve-selection="true"
          border
          height="420"
          @selection-change="onPayableSelectionChange"
        >
          <el-table-column type="selection" width="50" />
          <el-table-column prop="id" label="单号" width="90" />
          <el-table-column prop="customerCode" label="客户编号" width="120" />
          <el-table-column prop="customerName" label="客户名称" width="120" />
          <el-table-column prop="totalAmount" label="应收事务金额" width="110" />
          <el-table-column prop="writtenOffAmount" label="已核销" width="90" />
          <el-table-column prop="pendingAmount" label="待核销" width="90" />
          <el-table-column label="本次核销金额" min-width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.currentAmount"
                :min="0"
                :max="row.pendingAmount"
                :precision="2"
                :step="10"
                controls-position="right"
                style="width: 120px"
              />
            </template>
          </el-table-column>
        </el-table>
      </el-col>
    </el-row>

    <div class="result">
      <div class="result-head">
        <h3>匹配明细</h3>
        <el-button
          type="success"
          size="small"
          :loading="submitting"
          :disabled="matchResult.pairs.length === 0"
          @click="onSubmitMatchedDetails"
        >
          提交核销（明细区）
        </el-button>
      </div>
      <el-table :data="matchResult.pairs" border>
        <el-table-column prop="receiptId" label="收款单" width="140" />
        <el-table-column prop="payableId" label="应付账款" width="140" />
        <el-table-column prop="amount" label="匹配金额" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type { ElTable } from "element-plus";
import { isValidRow, useWriteoffMatcher } from "./useWriteoffMatcher";
import type { WriteoffRow } from "./useWriteoffMatcher";

interface SubmitDetailRow {
  receiptId: WriteoffRow["id"];
  payableId: WriteoffRow["id"];
  customerCode: string;
  customerName: string;
  writeoffAmount: number;
  receipt: {
    billDate?: string;
    totalAmount: number;
    writtenOffAmount: number;
    pendingAmount: number;
    currentAmount: number;
  };
  payable: {
    billDate?: string;
    totalAmount: number;
    writtenOffAmount: number;
    pendingAmount: number;
    currentAmount: number;
  };
}

interface SubmitPayload {
  submitTime: string;
  customerCode: string;
  customerName: string;
  totalWriteoffAmount: number;
  detailCount: number;
  details: SubmitDetailRow[];
}

const receiptTableRef = ref<InstanceType<typeof ElTable>>();
const payableTableRef = ref<InstanceType<typeof ElTable>>();
const submitting = ref(false);
const syncingSelection = ref(false);

const receipts = ref<WriteoffRow[]>([
  {
    id: "R001",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-01",
    totalAmount: 1000,
    writtenOffAmount: 200,
    pendingAmount: 800,
    currentAmount: 500,
  },
  {
    id: "R002",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-06",
    totalAmount: 700,
    writtenOffAmount: 100,
    pendingAmount: 600,
    currentAmount: 0,
  },
  {
    id: "R003",
    customerCode: "C2001",
    customerName: "广州华南",
    billDate: "2026-04-03",
    totalAmount: 300,
    writtenOffAmount: 0,
    pendingAmount: 300,
    currentAmount: 0,
  },
  {
    id: "R004",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-15",
    totalAmount: 1200,
    writtenOffAmount: 200,
    pendingAmount: 1000,
    currentAmount: 0,
  },
  {
    id: "R005",
    customerCode: "C2001",
    customerName: "广州华南",
    billDate: "2026-04-18",
    totalAmount: 900,
    writtenOffAmount: 300,
    pendingAmount: 600,
    currentAmount: 200,
  },
  {
    id: "R006",
    customerCode: "C3001",
    customerName: "北京正远",
    billDate: "2026-04-20",
    totalAmount: 500,
    writtenOffAmount: 100,
    pendingAmount: 400,
    currentAmount: 0,
  },
  {
    id: "R007",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-22",
    totalAmount: 450,
    writtenOffAmount: 50,
    pendingAmount: 400,
    currentAmount: 150,
  },
]);

const payables = ref<WriteoffRow[]>([
  {
    id: "P001",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-03-28",
    totalAmount: 400,
    writtenOffAmount: 50,
    pendingAmount: 350,
    currentAmount: 0,
  },
  {
    id: "P002",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-02",
    totalAmount: 500,
    writtenOffAmount: 100,
    pendingAmount: 400,
    currentAmount: 0,
  },
  {
    id: "P003",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-10",
    totalAmount: 600,
    writtenOffAmount: 0,
    pendingAmount: 600,
    currentAmount: 300,
  },
  {
    id: "P004",
    customerCode: "C3001",
    customerName: "北京正远",
    billDate: "2026-04-12",
    totalAmount: 100,
    writtenOffAmount: 0,
    pendingAmount: 100,
    currentAmount: 0,
  },
  {
    id: "P005",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-16",
    totalAmount: 900,
    writtenOffAmount: 100,
    pendingAmount: 800,
    currentAmount: 0,
  },
  {
    id: "P006",
    customerCode: "C1001",
    customerName: "上海晨光",
    billDate: "2026-04-18",
    totalAmount: 260,
    writtenOffAmount: 60,
    pendingAmount: 200,
    currentAmount: 100,
  },
  {
    id: "P007",
    customerCode: "C2001",
    customerName: "广州华南",
    billDate: "2026-04-06",
    totalAmount: 700,
    writtenOffAmount: 100,
    pendingAmount: 600,
    currentAmount: 0,
  },
  {
    id: "P008",
    customerCode: "C2001",
    customerName: "广州华南",
    billDate: "2026-04-21",
    totalAmount: 500,
    writtenOffAmount: 0,
    pendingAmount: 500,
    currentAmount: 250,
  },
  {
    id: "P009",
    customerCode: "C3001",
    customerName: "北京正远",
    billDate: "2026-04-23",
    totalAmount: 450,
    writtenOffAmount: 50,
    pendingAmount: 400,
    currentAmount: 0,
  },
]);

const selectedReceipts = ref<WriteoffRow[]>([]);
const selectedPayables = ref<WriteoffRow[]>([]);

const activeCustomerCode = computed(() => selectedReceipts.value[0]?.customerCode ?? "");
const visiblePayables = computed(() => {
  if (!activeCustomerCode.value) return payables.value;
  return payables.value.filter((p) => p.customerCode === activeCustomerCode.value);
});

const { matchResult, runAutoMatch } = useWriteoffMatcher();
const onlySelectedPayables = ref(false);
const sortPayablesByDate = ref(false);
const payableDateOrder = ref<"asc" | "desc">("asc");

const syncManualCustomerCodesFromTable = () => {
  const tableRows = (receiptTableRef.value?.getSelectionRows?.() ?? []) as WriteoffRow[];
  selectedReceipts.value = tableRows;
};

const canSelectReceipt = (row: WriteoffRow) => {
  if (selectedReceipts.value.length === 0) return true;
  return row.customerCode === selectedReceipts.value[0].customerCode;
};

const onReceiptSelectionChange = (_rows: WriteoffRow[]) => {
  if (syncingSelection.value) return;
  syncManualCustomerCodesFromTable();
  const selectedReceiptIdSet = new Set(selectedReceipts.value.map((row) => row.id));
  receipts.value.forEach((row) => {
    if (!selectedReceiptIdSet.has(row.id)) {
      row.currentAmount = 0;
    }
  });
  // 切换客户时清理右侧勾选，避免残留跨客户勾选状态
  if (selectedPayables.value.length > 0 && activeCustomerCode.value) {
    selectedPayables.value = selectedPayables.value.filter(
      (row) => row.customerCode === activeCustomerCode.value,
    );
  }
};

const onPayableSelectionChange = (rows: WriteoffRow[]) => {
  if (syncingSelection.value) return;
  selectedPayables.value = rows;
  const selectedPayableIdSet = new Set(rows.map((row) => row.id));
  payables.value.forEach((row) => {
    if (!selectedPayableIdSet.has(row.id)) {
      row.currentAmount = 0;
    }
  });
};

const applyMatchedPayableSelection = async () => {
  if (!payableTableRef.value) return;
  syncingSelection.value = true;
  await nextTick();
  payableTableRef.value.clearSelection();
  visiblePayables.value.forEach((row) => {
    if (matchResult.selectedPayableIds.includes(row.id)) {
      payableTableRef.value?.toggleRowSelection(row, true);
    }
  });
  await nextTick();
  syncingSelection.value = false;
};

watch(
  [() => visiblePayables.value.map((row) => row.id).join(","), () => matchResult.selectedPayableIds.join(",")],
  async () => {
    if (matchResult.selectedPayableIds.length === 0) return;
    await applyMatchedPayableSelection();
  },
);

const calculateCurrentMatchResult = () => {
  if (selectedReceipts.value.length === 0) {
    throw new Error("请先勾选一张收款单");
  }
  const first = selectedReceipts.value[0];
  if (!isValidRow(first)) {
    throw new Error("勾选的收款单数据不合法（请检查金额关系）");
  }
  const customerCode = first.customerCode;
  const customerSelectedPayables = selectedPayables.value.filter(
    (row) => row.customerCode === customerCode,
  );
  const hasPrioritySelection = customerSelectedPayables.length > 0;
  const useOnlySelectedPayables = hasPrioritySelection ? false : onlySelectedPayables.value;

  if (useOnlySelectedPayables && customerSelectedPayables.length === 0) {
    throw new Error("当前已开启“仅匹配已勾选应付”，请先勾选应付账款");
  }

  return runAutoMatch(first, receipts.value, payables.value, {
    onlySelectedPayables: useOnlySelectedPayables,
    selectedPayableIds: customerSelectedPayables.map((p) => p.id),
    prioritizeSelectedPayables: hasPrioritySelection,
    sortPayablesByDate: sortPayablesByDate.value,
    payableDateKey: "billDate",
    payableDateOrder: payableDateOrder.value,
  });
};

const runMatch = async () => {
  let result;
  try {
    result = calculateCurrentMatchResult();
  } catch (error) {
    const message = error instanceof Error ? error.message : "匹配失败";
    ElMessage.warning(message);
    return;
  }

  matchResult.pairs = result.pairs;
  matchResult.selectedReceiptIds = result.selectedReceiptIds;
  matchResult.selectedPayableIds = result.selectedPayableIds;
  matchResult.unmatchedReceiptAmount = result.unmatchedReceiptAmount;
  matchResult.unmatchedPayableAmount = result.unmatchedPayableAmount;
  await nextTick();

  syncingSelection.value = true;
  payableTableRef.value?.clearSelection();

  // 保留用户手动勾选的收款单，只补勾匹配到的行，避免客户过滤被自动流程覆盖
  receipts.value.forEach((row) => {
    const checked = matchResult.selectedReceiptIds.includes(row.id);
    if (checked) {
      receiptTableRef.value?.toggleRowSelection(row, true);
    }
  });
  await applyMatchedPayableSelection();
  syncingSelection.value = false;
  syncManualCustomerCodesFromTable();

  ElMessage.success("匹配完成，已自动勾选并回填本次核销金额");
};

const onAutoMatch = async () => {
  await runMatch();
};

const buildSubmitPayload = (pairs: typeof matchResult.pairs): SubmitPayload => {
  const receiptMap = new Map(receipts.value.map((x) => [x.id, x]));
  const payableMap = new Map(payables.value.map((x) => [x.id, x]));

  const details: SubmitDetailRow[] = pairs.map((pair) => {
    const receipt = receiptMap.get(pair.receiptId);
    const payable = payableMap.get(pair.payableId);
    if (!receipt || !payable) {
      throw new Error(`匹配明细缺少原始单据数据: ${pair.receiptId} -> ${pair.payableId}`);
    }
    return {
      receiptId: pair.receiptId,
      payableId: pair.payableId,
      customerCode: receipt.customerCode,
      customerName: receipt.customerName,
      writeoffAmount: pair.amount,
      receipt: {
        billDate: receipt.billDate,
        totalAmount: receipt.totalAmount,
        writtenOffAmount: receipt.writtenOffAmount,
        pendingAmount: receipt.pendingAmount,
        currentAmount: receipt.currentAmount,
      },
      payable: {
        billDate: payable.billDate,
        totalAmount: payable.totalAmount,
        writtenOffAmount: payable.writtenOffAmount,
        pendingAmount: payable.pendingAmount,
        currentAmount: payable.currentAmount,
      },
    };
  });

  const totalWriteoffAmount = Number(
    details.reduce((sum, row) => sum + row.writeoffAmount, 0).toFixed(2),
  );
  const customerCode = details[0]?.customerCode ?? "";
  const customerName = details[0]?.customerName ?? "";

  return {
    submitTime: new Date().toISOString(),
    customerCode,
    customerName,
    totalWriteoffAmount,
    detailCount: details.length,
    details,
  };
};

const submitWriteoff = async (payload: SubmitPayload) => {
  const response = await fetch("/api/writeoff/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`接口返回失败: ${response.status}`);
  }
  return response.json();
};

const onSubmitMatchedDetails = async () => {
  try {
    const freshResult = calculateCurrentMatchResult();
    const payload = buildSubmitPayload(freshResult.pairs);
    submitting.value = true;
    await submitWriteoff(payload);
    ElMessage.success(`提交成功，已提交 ${payload.detailCount} 条明细`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    ElMessage.error(`提交失败：${message}`);
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.page {
  padding: 16px;
}

.mock-banner {
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #8a2d0b;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 4px;
}

.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.result {
  margin-top: 16px;
}

.result-head {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.debug-line {
  margin: 0 0 8px;
  font-size: 12px;
  color: #606266;
}

h3 {
  margin: 0;
}
</style>

