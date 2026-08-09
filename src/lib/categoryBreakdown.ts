export interface TransactionForBreakdown {
  amount: number;
  category_id: number | null;
  category_name: string | null;
}

export interface CategoryBreakdownRow {
  category_id: number | null;
  category_name: string;
  total: number;
}

export function computeCategoryBreakdown(
  transactions: TransactionForBreakdown[],
): CategoryBreakdownRow[] {
  const totals = new Map<string, CategoryBreakdownRow>();

  for (const t of transactions) {
    const key = t.category_id === null ? 'uncategorized' : String(t.category_id);
    const name = t.category_name ?? 'Uncategorized';
    const existing = totals.get(key);
    if (existing) {
      existing.total += t.amount;
    } else {
      totals.set(key, { category_id: t.category_id, category_name: name, total: t.amount });
    }
  }

  return [...totals.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
