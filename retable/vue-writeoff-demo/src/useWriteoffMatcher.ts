import { reactive } from "vue";

export type Id = string | number;

export interface WriteoffRow {
  id: Id;
  customerCode: string;
  customerName: string;
  billDate?: string;
  totalAmount: number;
  writtenOffAmount: number;
  pendingAmount: number;
  currentAmount: number;
}

export interface MatchPair {
  receiptId: Id;
  payableId: Id;
  amount: number;
}

export interface MatchResult {
  pairs: MatchPair[];
  selectedReceiptIds: Id[];
  selectedPayableIds: Id[];
  unmatchedReceiptAmount: number;
  unmatchedPayableAmount: number;
}

export interface AutoMatchOptions {
  onlySelectedPayables?: boolean;
  selectedPayableIds?: Id[];
  prioritizeSelectedPayables?: boolean;
  sortPayablesByDate?: boolean;
  payableDateKey?: keyof WriteoffRow | string;
  payableDateOrder?: "asc" | "desc";
}

const toAmount = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(v, 0) : 0;
};

const round2 = (n: number) => Number(n.toFixed(2));

export const isValidRow = (row: WriteoffRow) => {
  const total = toAmount(row.totalAmount);
  const written = toAmount(row.writtenOffAmount);
  const pending = toAmount(row.pendingAmount);
  const current = toAmount(row.currentAmount);
  return Math.abs(written + pending - total) < 1e-8 && current <= pending;
};

const getExpandableAmount = (row: WriteoffRow, matchedPart: number) => {
  const current = toAmount(row.currentAmount);
  const pending = toAmount(row.pendingAmount);
  const dynamicAmount = Math.max(current, pending - matchedPart);
  // 安全上限：不能超过该行待核销剩余额度
  return Math.max(Math.min(dynamicAmount, pending - matchedPart), 0);
};

export function useWriteoffMatcher() {
  const matchResult = reactive<MatchResult>({
    pairs: [],
    selectedReceiptIds: [],
    selectedPayableIds: [],
    unmatchedReceiptAmount: 0,
    unmatchedPayableAmount: 0,
  });

  const runAutoMatch = (
    selectedReceipt: WriteoffRow,
    allReceipts: WriteoffRow[],
    allPayables: WriteoffRow[],
    options: AutoMatchOptions = {},
  ) => {
    const customerCode = selectedReceipt.customerCode;
    const {
      onlySelectedPayables = false,
      selectedPayableIds: targetPayableIds = [],
      prioritizeSelectedPayables = false,
      sortPayablesByDate = false,
      payableDateKey = "billDate",
      payableDateOrder = "asc",
    } = options;

    const customerReceipts = allReceipts.filter(
      (r) => r.customerCode === customerCode && isValidRow(r),
    );
    const selectedPayableIdSet = new Set(targetPayableIds);
    let customerPayables = allPayables.filter((p) => {
      if (p.customerCode !== customerCode || !isValidRow(p)) return false;
      if (!onlySelectedPayables) return true;
      return selectedPayableIdSet.has(p.id);
    });

    if (sortPayablesByDate) {
      customerPayables.sort((a, b) => {
        const aRaw = (a as unknown as Record<string, unknown>)[payableDateKey];
        const bRaw = (b as unknown as Record<string, unknown>)[payableDateKey];
        const aTime = new Date(String(aRaw ?? "")).getTime();
        const bTime = new Date(String(bRaw ?? "")).getTime();
        const av = Number.isFinite(aTime) ? aTime : 0;
        const bv = Number.isFinite(bTime) ? bTime : 0;
        return payableDateOrder === "asc" ? av - bv : bv - av;
      });
    }

    if (prioritizeSelectedPayables && selectedPayableIdSet.size > 0 && !onlySelectedPayables) {
      // 场景2强保证：先跑勾选应收，再跑未勾选应收（同客户）
      const selectedGroup = customerPayables.filter((p) => selectedPayableIdSet.has(p.id));
      const unselectedGroup = customerPayables.filter((p) => !selectedPayableIdSet.has(p.id));
      customerPayables = [...selectedGroup, ...unselectedGroup];
    }

    const receiptsOrdered = [
      selectedReceipt,
      ...customerReceipts.filter((r) => r.id !== selectedReceipt.id),
    ];

    const receiptRemain = receiptsOrdered.map((r) => ({
      row: r,
      matchedPart: 0,
    }));
    const payableRemain = customerPayables.map((p) => ({
      row: p,
      matchedPart: 0,
    }));

    const pairs: MatchPair[] = [];
    const selectedReceiptIds = new Set<Id>();
    const selectedPayableIds = new Set<Id>();

    let i = 0;
    let j = 0;

    while (i < receiptRemain.length && j < payableRemain.length) {
      const r = receiptRemain[i];
      const p = payableRemain[j];

      const rRemain = getExpandableAmount(r.row, r.matchedPart);
      const pRemain = getExpandableAmount(p.row, p.matchedPart);

      if (rRemain <= 0) {
        i += 1;
        continue;
      }
      if (pRemain <= 0) {
        j += 1;
        continue;
      }

      const amount = Math.min(rRemain, pRemain);
      r.matchedPart = round2(r.matchedPart + amount);
      p.matchedPart = round2(p.matchedPart + amount);

      pairs.push({
        receiptId: r.row.id,
        payableId: p.row.id,
        amount: round2(amount),
      });
      selectedReceiptIds.add(r.row.id);
      selectedPayableIds.add(p.row.id);
    }

    const receiptCurrentMap = new Map<Id, number>();
    const payableCurrentMap = new Map<Id, number>();
    for (const pair of pairs) {
      receiptCurrentMap.set(
        pair.receiptId,
        round2((receiptCurrentMap.get(pair.receiptId) || 0) + pair.amount),
      );
      payableCurrentMap.set(
        pair.payableId,
        round2((payableCurrentMap.get(pair.payableId) || 0) + pair.amount),
      );
    }

    allReceipts.forEach((r) => {
      if (r.customerCode === customerCode) {
        r.currentAmount = receiptCurrentMap.get(r.id) || 0;
      }
    });
    allPayables.forEach((p) => {
      if (p.customerCode === customerCode) {
        p.currentAmount = payableCurrentMap.get(p.id) || 0;
      }
    });

    matchResult.pairs = pairs;
    matchResult.selectedReceiptIds = Array.from(selectedReceiptIds);
    matchResult.selectedPayableIds = Array.from(selectedPayableIds);
    matchResult.unmatchedReceiptAmount = round2(
      receiptRemain.reduce(
        (sum, item) => sum + getExpandableAmount(item.row, item.matchedPart),
        0,
      ),
    );
    matchResult.unmatchedPayableAmount = round2(
      payableRemain.reduce(
        (sum, item) => sum + getExpandableAmount(item.row, item.matchedPart),
        0,
      ),
    );

    return matchResult;
  };

  return {
    matchResult,
    runAutoMatch,
  };
}

