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
  Activity,
  ChefHat,
} from 'lucide-react';
import { ActivityEvent, MenuItem, ModuleId, Order, RestaurantTable, WaiterCall } from '../types';
import { REVENUE_SERIES_7D } from '../data/mockData';
import { Badge, StatCard } from '../components/ui/Primitives';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/PageHeader';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { AreaChart } from '../components/charts/AreaChart';
import { formatCurrency } from '../services/api';

const ACTIVITY_STYLE: Record<ActivityEvent['type'], { icon: React.ReactNode; tone: string }> = {
  order: { icon: <Clock className="h-4 w-4" />, tone: 'bg-info-soft text-info-ink' },
  waiter: { icon: <BellRing className="h-4 w-4" />, tone: 'bg-warning-soft text-warning-ink' },
  menu: { icon: <UtensilsCrossed className="h-4 w-4" />, tone: 'bg-primary-soft text-primary-ink' },
  staff: { icon: <Users className="h-4 w-4" />, tone: 'bg-surface-2 text-ink-2' },
};

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

  const todayOrderRevenue = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const weeklyRevenue = REVENUE_SERIES_7D.reduce((s, d) => s + d.revenue, 0) + todayOrderRevenue;
  const activeOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing' || o.status === 'Ready').length;
  const occupiedTables = tables.filter((t) => t.status === 'Occupied').length;
  const incomingCalls = waiterCalls.filter((w) => w.status === 'Incoming').length;

  const popularDishes = [...menuItems].sort((a, b) => b.ordersCount - a.ordersCount).slice(0, 4);

  const chartData = REVENUE_SERIES_7D.map((d) => ({
    label: d.label,
    value: chartMetric === 'revenue' ? d.revenue : d.orders,
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <Notice action={<Badge variant="amber">Demo data</Badge>}>
        You are viewing seeded sample analytics stored in this browser. Connect the backend before using these figures for business decisions.
      </Notice>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Weekly revenue"
          value={formatCurrency(weeklyRevenue, currency)}
          delta="+14.2%"
          subtitle="vs. prior 7 days"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Active orders"
          value={String(activeOrders)}
          delta={`${orders.length} total`}
          subtitle="kitchen & bar queue"
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <StatCard
          title="Guests seated"
          value={`${occupiedTables}/${tables.length} tables`}
          delta="68% occupancy"
          subtitle="evening service"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Avg. check size"
          value={formatCurrency(orders.length ? todayOrderRevenue / orders.length : 0, currency)}
          delta={`${incomingCalls} waiter calls`}
          positive={incomingCalls === 0}
          subtitle="service snapshot"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="7-day performance"
          description="Daily dining room & takeaway volume"
          actions={
            <div role="group" aria-label="Chart metric" className="flex rounded-lg bg-surface-2 p-0.5">
              {(['revenue', 'orders'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={chartMetric === m}
                  onClick={() => setChartMetric(m)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                    chartMetric === m
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          }
          bodyClassName="px-3 pb-4 pt-4 sm:px-5"
        >
          <AreaChart
            data={chartData}
            seriesName={chartMetric === 'revenue' ? 'Daily revenue' : 'Daily orders'}
            formatValue={(v) => (chartMetric === 'revenue' ? formatCurrency(v, currency).replace(/\.00$/, '') : `${v} orders`)}
            formatAxis={(v) => {
              if (chartMetric !== 'revenue') return String(v);
              const full = formatCurrency(v, currency).replace(/\.00$/, '');
              return v >= 1000 ? full.replace(/,000$/, 'k').replace(/,(\d)00$/, '.$1k') : full;
            }}
          />
        </Card>

        <Card
          title="Recent activity"
          actions={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('orders')} icon={<ArrowUpRight className="h-3.5 w-3.5" />} className="-mr-2 flex-row-reverse">
              View orders
            </Button>
          }
          bodyClassName="px-5 pb-3 pt-2"
        >
          {activities.length === 0 ? (
            <EmptyState
              compact
              icon={<Activity className="h-5 w-5" />}
              title="No activity yet"
              description="New orders, waiter calls and menu changes appear here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activities.slice(0, 5).map((act) => {
                const style = ACTIVITY_STYLE[act.type] ?? ACTIVITY_STYLE.order;
                return (
                  <li key={act.id} className="flex items-start gap-3 py-3">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.tone}`}>
                      {style.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{act.title}</p>
                      <p className="truncate text-sm text-ink-3">{act.detail}</p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-ink-3">{act.time}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Popular dishes"
        description="Top-performing plates by cumulative orders"
        actions={
          <Button size="sm" variant="secondary" onClick={() => onNavigate('menu')}>
            Manage menu
          </Button>
        }
      >
        {popularDishes.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="h-5 w-5" />}
            title="No menu items yet"
            description="Add dishes to see which ones your guests order most."
            actionLabel="Go to menu"
            onAction={() => onNavigate('menu')}
          />
        ) : (
          <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popularDishes.map((dish, index) => (
              <article
                key={dish.id}
                className="group overflow-hidden rounded-xl border border-line bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
                  <img
                    src={dish.imageUrl}
                    alt={dish.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="tabular absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md bg-surface/90 text-xs font-semibold text-ink shadow-card backdrop-blur">
                    {index + 1}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 text-sm font-semibold text-ink">{dish.name}</h3>
                    <span className="tabular shrink-0 text-sm font-semibold text-ink">
                      {formatCurrency(dish.price, currency)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-ink-3">
                    <span className="tabular">{dish.ordersCount} orders</span>
                    <Badge variant={dish.available ? 'emerald' : 'rose'}>
                      {dish.available ? 'In stock' : 'Paused'}
                    </Badge>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
