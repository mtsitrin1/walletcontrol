'use client';

import { useEffect, useState } from 'react';

interface Category {
  id: number;
  name: string;
}

interface Transaction {
  id: number;
  date: string;
  amount: number;
  merchant: string;
  category_id: number | null;
  category_name: string | null;
}

interface BreakdownRow {
  category_id: number | null;
  category_name: string;
  total: number;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [form, setForm] = useState({ date: '', amount: '', merchant: '', category_id: '' });

  async function loadAll() {
    const [catsRes, txRes, breakdownRes] = await Promise.all([
      fetch('/api/categories'),
      fetch(`/api/transactions?month=${month}`),
      fetch(`/api/breakdown?month=${month}`),
    ]);
    setCategories(await catsRes.json());
    setTransactions(await txRes.json());
    setBreakdown(await breakdownRes.json());
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: form.date,
        amount: Number(form.amount),
        merchant: form.merchant,
        category_id: form.category_id ? Number(form.category_id) : null,
      }),
    });
    setForm({ date: '', amount: '', merchant: '', category_id: '' });
    loadAll();
  }

  async function handleCategoryChange(id: number, category_id: string) {
    await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: category_id ? Number(category_id) : null }),
    });
    loadAll();
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>walletcontrol</h1>

      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

      <h2>Add transaction</h2>
      <form onSubmit={handleAddTransaction} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="date"
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          required
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          type="text"
          placeholder="Merchant"
          required
          value={form.merchant}
          onChange={(e) => setForm({ ...form, merchant: e.target.value })}
        />
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit">Add</button>
      </form>

      <h2>Category breakdown</h2>
      <ul>
        {breakdown.map((row) => (
          <li key={row.category_id ?? 'uncategorized'}>
            {row.category_name}: {row.total.toFixed(2)}
          </li>
        ))}
      </ul>

      <h2>Transactions</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{t.merchant}</td>
              <td>{t.amount}</td>
              <td>
                <select
                  value={t.category_id ?? ''}
                  onChange={(e) => handleCategoryChange(t.id, e.target.value)}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
