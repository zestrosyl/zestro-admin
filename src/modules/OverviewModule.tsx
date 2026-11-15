import React from 'react';
import {
  ShoppingBag,
  Banknote,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  BellRing,
  QrCode,
  UtensilsCrossed,
} from 'lucide-react';
import {
  ModuleId,
  Order,
  MenuItem,
  RestaurantTable,
  WaiterCall,
  ActivityEvent,
} from '../types';
import { StatCard, Badge } from '../components/ui/Primitives';
import { formatCurrency, formatDhakaDateTime, toDhakaDateKey } from '../services/api';

function orderStatusBadge(status: Order['status']): 'amber' | 'gold' | 'emerald' | 'rose' | 'neutral' {
  if (status === 'Pending') return 'amber';
  if (status === 'Preparing') return 'neutral';
  if (status === 'Ready' || status === 'Served') return 'emerald';
  if (status === 'Cancelled') return 'rose';
  return 'neutral';
}

export const OverviewModule: React.FC<{
  orders: Order[];
  menuItems: MenuItem[];
  currency: string;
  tables: RestaurantTable[];
  waiterCalls: WaiterCall[];
  activities: ActivityEvent[];
  onNavigate: (module: ModuleId) => void;
}> = ({ orders, menuItems, currency, tables, waiterCalls, onNavigate }) => {
  const todayDhaka = toDhakaDateKey(new Date());

  const validOrders = orders.filter((o) => o.status !== 'Cancelled');
  const todayOrders = validOrders.filter((o) => toDhakaDateKey(o.createdAt) === todayDhaka);
  const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0);

  const pendingOrders = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Preparing' || o.status === 'Ready'
  );
  const awaitingAcceptanceCount = orders.filter((o) => o.status === 'Pending').length;
  const completedOrders = orders.filter((o) => o.status === 'Served');
  const todayCompletedCount = completedOrders.filter(
    (o) => toDhakaDateKey(o.createdAt) === todayDhaka
  ).length;

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const incomingCalls = waiterCalls.filter((w) => w.status === 'Incoming').length;
  const occupiedTables = tables.filter((t) => t.status === 'Occupied').length;
  const availableItems = menuItems.filter((m) => m.available).length;

  return (
    <div className="space-y-6">
      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Today's Orders"
          value={String(todayOrders.length)}
          subtitle={`${validOrders.length} total non-cancelled`}
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <StatCard
          title="Today's Sales"
          value={formatCurrency(todaySales, currency)}
          subtitle="BDT (৳) · Asia/Dhaka"
          icon={<Banknote className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Orders"
          value={String(pendingOrders.length)}
          delta={awaitingAcceptanceCount > 0 ? `${awaitingAcceptanceCount} new` : undefined}
          positive={awaitingAcceptanceCount === 0}
          subtitle="awaiting or in progress"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Completed Orders"
          value={String(completedOrders.length)}
          delta={`${todayCompletedCount} today`}
          positive
          subtitle="served & finished"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      {/* Operations Quick Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onNavigate('waiter-calls')}
          className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-4 text-left hover:border-[#111111]/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#111111] border border-[#E5E7EB]">
              <BellRing className={`h-4 w-4 ${incomingCalls > 0 ? 'text-[#16A34A]' : ''}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">Waiter Calls</p>
              <p className="text-sm font-semibold text-[#111111]">
                {incomingCalls > 0 ? `${incomingCalls} waiting` : 'No pending calls'}
              </p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-neutral-400" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('tables')}
          className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-4 text-left hover:border-[#111111]/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#111111] border border-[#E5E7EB]">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">Tables</p>
              <p className="text-sm font-semibold text-[#111111]">
                {occupiedTables}/{tables.length} occupied
              </p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-neutral-400" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('menu')}
          className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-4 text-left hover:border-[#111111]/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#111111] border border-[#E5E7EB]">
              <UtensilsCrossed className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">Menu Availability</p>
              <p className="text-sm font-semibold text-[#111111]">
                {availableItems}/{menuItems.length} items active
              </p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-neutral-400" />
        </button>
      </div>

      {/* Recent Orders Table */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#111111]">Recent Orders</h2>
            <p className="text-xs text-neutral-500">
              Latest customer orders synced from your restaurant website and table QR menus
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5]"
            >
              View Reports
            </button>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="rounded-lg bg-[#111111] px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Manage Orders
            </button>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-[#111111]">No orders yet</p>
            <p className="mt-1 text-xs text-neutral-500">
              New customer orders from your website and table QR codes will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F5] text-xs font-medium uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Customer / Table</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3">Date &amp; Time</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {recentOrders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => onNavigate('orders')}
                    className="cursor-pointer hover:bg-[#F5F5F5]/70"
                  >
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-[#111111]">
                      #{order.orderNumber}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-[#111111]">
                        {order.customerName || 'Guest'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {order.tableNumber
                          ? `Table ${order.tableNumber}`
                          : order.orderType}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs text-neutral-600">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                    </td>
                    <td className="px-5 py-3 text-xs text-neutral-500">
                      {formatDhakaDateTime(order.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold text-[#111111]">
                      {formatCurrency(order.total, currency)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={orderStatusBadge(order.status)}>{order.status}</Badge>
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
