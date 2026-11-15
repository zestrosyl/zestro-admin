import React, { useState } from 'react';
import {
  DollarSign,
  ShoppingBag,
  Users,
  TrendingUp,
  BellRing,
  UtensilsCrossed,
  Clock,
  ArrowUpRight,
  ImageOff,
} from 'lucide-react';
import { ActivityEvent, MenuItem, ModuleId, Order, RestaurantTable, WaiterCall } from '../types';
import { Badge, StatCard } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';

function formatActivityTime(value: string): string {
  if (!value) return 'Recently';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const diffMinutes = Math.round((Date.now() - parsed.getTime()) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const OverviewModule: React.FC<{
  orders: Order[];
  menuItems: MenuItem[];
  currency: string;
  tables: RestaurantTable[];
  waiterCalls: WaiterCall[];
  activities: ActivityEvent[];
  onNavigate: (module: ModuleId) => void;
}> = ({ orders, menuItems, currency, tables, waiterCalls, activities, onNavigate }) => {
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue');

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const validOrders = orders.filter((o) => o.status !== 'Cancelled');
  const recentOrders = validOrders.filter((o) => {
    const created = new Date(o.createdAt);
    return Number.isFinite(created.getTime()) && created >= sevenDaysAgo;
  });
  const weeklyRevenue = recentOrders.reduce((sum, o) => sum + o.total, 0);
  const totalValidRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);

  const revenueSeries = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(sevenDaysAgo);
    day.setDate(sevenDaysAgo.getDate() + index);
    const key = day.toLocaleDateString('en-CA');
    const dayOrders = recentOrders.filter((o) => {
      const created = new Date(o.createdAt);
      return Number.isFinite(created.getTime()) && created.toLocaleDateString('en-CA') === key;
    });
    return {
      key,
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
      orders: dayOrders.length,
    };
  });

  const activeOrders = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Preparing' || o.status === 'Ready'
  ).length;
  const occupiedTables = tables.filter((t) => t.status === 'Occupied').length;
  const occupancy = tables.length ? Math.round((occupiedTables / tables.length) * 100) : 0;
  const incomingCalls = waiterCalls.filter((w) => w.status === 'Incoming').length;

  const dishOrderCounts = new Map<string, number>();
  for (const order of validOrders) {
    for (const line of order.items) {
      if (line.menuItemId) {
        dishOrderCounts.set(line.menuItemId, (dishOrderCounts.get(line.menuItemId) ?? 0) + line.quantity);
      }
    }
  }

  const popularDishes = [...menuItems]
    .map((dish) => ({
      ...dish,
      ordersCount: dishOrderCounts.get(dish.id) ?? dish.ordersCount ?? 0,
    }))
    .sort((a, b) => b.ordersCount - a.ordersCount || Number(b.featured) - Number(a.featured))
    .slice(0, 4);

  const maxVal = Math.max(
    ...revenueSeries.map((d) => (chartMetric === 'revenue' ? d.revenue : d.orders)),
    1
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D7A65A]/20 bg-[#D7A65A]/[0.06] px-4 py-3">
        <p className="text-xs text-[#F3EBDD]/70">
          Live figures from your Cloudflare D1 restaurant database. No sample analytics are included.
        </p>
        <Badge variant="emerald">Live database</Badge>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Weekly Revenue"
          value={formatCurrency(weeklyRevenue, currency)}
          delta={`${recentOrders.length} orders`}
          subtitle="rolling 7-day total"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Active Orders"
          value={String(activeOrders)}
          delta={`${orders.length} total`}
          subtitle="kitchen & bar queue"
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <StatCard
          title="Guests Seated"
          value={`${occupiedTables}/${tables.length} Tables`}
          delta={`${occupancy}% occupancy`}
          subtitle="live floor status"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Avg. Check Size"
          value={formatCurrency(validOrders.length ? totalValidRevenue / validOrders.length : 0, currency)}
          delta={`${incomingCalls} waiter calls`}
          positive={incomingCalls === 0}
          subtitle="service snapshot"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">7-Day Performance</h2>
              <p className="text-xs text-[#F3EBDD]/60">Daily dining room, takeaway &amp; delivery volume</p>
            </div>
            <div className="flex rounded-xl border border-[#2C3D34] bg-[#101B17] p-1">
              {(['revenue', 'orders'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChartMetric(m)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                    chartMetric === m
                      ? 'bg-[#D7A65A] text-[#101B17]'
                      : 'text-[#F3EBDD]/70 hover:text-[#F3EBDD]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex h-56 items-end justify-between gap-2 sm:gap-4">
            {revenueSeries.map((d) => {
              const val = chartMetric === 'revenue' ? d.revenue : d.orders;
              const pct = val === 0 ? 6 : Math.max(12, Math.round((val / maxVal) * 100));
              return (
                <div key={d.key} className="group flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-medium text-[#D7A65A] opacity-80 transition group-hover:opacity-100">
                    {chartMetric === 'revenue' ? formatCurrency(val, currency).replace(/\.00$/, '') : val}
                  </span>
                  <div className="flex h-40 w-full items-end rounded-xl bg-[#101B17]/70 p-1">
                    <div
                      style={{ height: `${pct}%` }}
                      className="w-full rounded-lg bg-gradient-to-t from-[#D7A65A]/75 to-[#D7A65A] transition-all duration-300 group-hover:brightness-110"
                    />
                  </div>
                  <span className="text-xs text-[#F3EBDD]/65">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Recent Activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="flex items-center gap-1 text-xs font-medium text-[#D7A65A] hover:underline"
            >
              View Orders <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {activities.length === 0 ? (
              <div className="rounded-xl border border-[#2C3D34] bg-[#101B17]/60 p-6 text-center text-xs text-[#F3EBDD]/55">
                No operational activity logged yet. Orders, waiter calls, and catalog updates will appear here live.
              </div>
            ) : (
              activities.slice(0, 5).map((act) => (
                <div
                  key={act.id}
                  className="flex items-start gap-3 rounded-xl border border-[#2C3D34] bg-[#101B17]/75 p-3"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1D2922] text-[#D7A65A]">
                    {act.type === 'waiter' ? (
                      <BellRing className="h-4 w-4" />
                    ) : act.type === 'menu' ? (
                      <UtensilsCrossed className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#F3EBDD]">{act.title}</p>
                    <p className="truncate text-xs text-[#F3EBDD]/60">{act.detail}</p>
                    <p className="mt-1 text-[11px] text-[#D7A65A]/80">
                      {formatActivityTime(act.createdAt || act.time)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[#F3EBDD]">Popular Dishes</h2>
            <p className="text-xs text-[#F3EBDD]/60">Top-performing plates by live order volume</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('menu')}
            className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2 text-xs font-medium text-[#D7A65A] transition hover:border-[#D7A65A]/50"
          >
            Manage Menu
          </button>
        </div>

        {popularDishes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-[#2C3D34] bg-[#101B17]/60 p-8 text-center text-sm text-[#F3EBDD]/60">
            No dishes in your live menu yet. Add dishes in Menu Management to publish them to guests.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popularDishes.map((dish) => (
              <div
                key={dish.id}
                className="overflow-hidden rounded-xl border border-[#2C3D34] bg-[#101B17] transition hover:border-[#D7A65A]/45"
              >
                {dish.imageUrl ? (
                  <img src={dish.imageUrl} alt={dish.name} className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-36 w-full flex-col items-center justify-center gap-1 bg-[#15201B] text-[#F3EBDD]/35">
                    <ImageOff className="h-6 w-6" />
                    <span className="text-[11px]">No photo</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 text-sm font-semibold text-[#F3EBDD]">{dish.name}</h3>
                    <span className="shrink-0 text-sm font-semibold text-[#D7A65A]">
                      {formatCurrency(dish.price, currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[#F3EBDD]/60">
                    <span>{dish.ordersCount} orders</span>
                    <Badge variant={dish.available ? 'emerald' : 'rose'}>
                      {dish.available ? 'In Stock' : 'Sold Out'}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
