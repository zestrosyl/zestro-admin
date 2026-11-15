import React, { useMemo, useState } from 'react';
import { Calendar, ShoppingBag, Banknote, CheckCircle2, Clock } from 'lucide-react';
import { Order } from '../types';
import { StatCard } from '../components/ui/Primitives';
import { formatCurrency, formatDhakaDate, toDhakaDateKey } from '../services/api';

type PresetRange = 'today' | '7d' | '30d' | 'custom';

function shiftDhakaDate(daysAgo: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - daysAgo);
  return toDhakaDateKey(now);
}

export const ReportsModule: React.FC<{
  orders: Order[];
  currency: string;
}> = ({ orders, currency }) => {
  const todayKey = toDhakaDateKey(new Date());
  const [preset, setPreset] = useState<PresetRange>('7d');
  const [fromDate, setFromDate] = useState<string>(shiftDhakaDate(6));
  const [toDate, setToDate] = useState<string>(todayKey);

  const handlePreset = (next: PresetRange) => {
    setPreset(next);
    if (next === 'today') {
      setFromDate(todayKey);
      setToDate(todayKey);
    } else if (next === '7d') {
      setFromDate(shiftDhakaDate(6));
      setToDate(todayKey);
    } else if (next === '30d') {
      setFromDate(shiftDhakaDate(29));
      setToDate(todayKey);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const key = toDhakaDateKey(o.createdAt);
      if (!key) return false;
      if (fromDate && key < fromDate) return false;
      if (toDate && key > toDate) return false;
      return true;
    });
  }, [orders, fromDate, toDate]);

  const summary = useMemo(() => {
    const nonCancelled = filteredOrders.filter((o) => o.status !== 'Cancelled');
    const completed = filteredOrders.filter((o) => o.status === 'Served');
    const pending = filteredOrders.filter(
      (o) => o.status === 'Pending' || o.status === 'Preparing' || o.status === 'Ready'
    );
    const cancelled = filteredOrders.filter((o) => o.status === 'Cancelled');
    const totalSales = nonCancelled.reduce((sum, o) => sum + o.total, 0);
    return {
      orderCount: nonCancelled.length,
      totalSales,
      completedCount: completed.length,
      pendingCount: pending.length,
      cancelledCount: cancelled.length,
    };
  }, [filteredOrders]);

  const dailyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        orders: number;
        completed: number;
        pending: number;
        cancelled: number;
        sales: number;
      }
    >();

    for (const o of filteredOrders) {
      const key = toDhakaDateKey(o.createdAt);
      if (!key) continue;
      const cur = map.get(key) ?? {
        dateKey: key,
        orders: 0,
        completed: 0,
        pending: 0,
        cancelled: 0,
        sales: 0,
      };
      if (o.status === 'Cancelled') {
        cur.cancelled += 1;
      } else {
        cur.orders += 1;
        cur.sales += o.total;
        if (o.status === 'Served') cur.completed += 1;
        else cur.pending += 1;
      }
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'custom', label: 'Custom Range' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handlePreset(item.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                preset === item.id
                  ? 'bg-[#111111] text-white'
                  : 'border border-[#E5E7EB] bg-[#F5F5F5] text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Calendar className="h-4 w-4 text-neutral-400" />
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(e) => {
              setPreset('custom');
              setFromDate(e.target.value);
            }}
            className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-2.5 py-1.5 text-xs text-[#111111]"
          />
          <span className="text-neutral-400">to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(e) => {
              setPreset('custom');
              setToDate(e.target.value);
            }}
            className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-2.5 py-1.5 text-xs text-[#111111]"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Orders"
          value={String(summary.orderCount)}
          subtitle={`${summary.cancelledCount} cancelled`}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <StatCard
          title="Total Sales"
          value={formatCurrency(summary.totalSales, currency)}
          subtitle="excluding cancelled"
          icon={<Banknote className="h-5 w-5" />}
        />
        <StatCard
          title="Completed Orders"
          value={String(summary.completedCount)}
          positive
          subtitle="served orders"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Orders"
          value={String(summary.pendingCount)}
          positive={summary.pendingCount === 0}
          subtitle="in active queue"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Daily Breakdown Table */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <h2 className="text-base font-semibold text-[#111111]">Daily Sales &amp; Order Summary</h2>
          <p className="text-xs text-neutral-500">
            Dates grouped in Asia/Dhaka timezone (DD-MM-YYYY) from live restaurant orders
          </p>
        </div>

        {dailyRows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-[#111111]">No orders in selected date range</p>
            <p className="mt-1 text-xs text-neutral-500">
              Try expanding your date filter or wait for new orders to arrive.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F5] text-xs font-medium uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Orders</th>
                  <th className="px-5 py-3">Completed</th>
                  <th className="px-5 py-3">Pending</th>
                  <th className="px-5 py-3">Cancelled</th>
                  <th className="px-5 py-3 text-right">Daily Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {dailyRows.map((row) => (
                  <tr key={row.dateKey} className="hover:bg-[#F5F5F5]/60">
                    <td className="px-5 py-3 font-medium text-[#111111]">
                      {formatDhakaDate(row.dateKey)}
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{row.orders}</td>
                    <td className="px-5 py-3 font-medium text-[#16A34A]">{row.completed}</td>
                    <td className="px-5 py-3 text-amber-700">{row.pending}</td>
                    <td className="px-5 py-3 text-neutral-500">{row.cancelled}</td>
                    <td className="px-5 py-3 text-right font-semibold text-[#111111]">
                      {formatCurrency(row.sales, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
