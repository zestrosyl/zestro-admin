import React, { useMemo, useState } from 'react';
import {
  Search,
  UserCheck,
  Phone,
  Mail,
  ShoppingBag,
  DollarSign,
  Calendar,
  Eye,
  MapPin,
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { Badge, Modal, StatCard } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  deliveryAddress: string | null;
  totalOrders: number;
  totalSpending: number;
  lastOrderDate: string;
  orders: Order[];
}

function normalizePhoneKey(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/[^\d+]/g, '');
  return digits || trimmed.toLowerCase();
}

function normalizeNameKey(raw?: string): string {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseOrderTime(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || '—';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeVariant(status: OrderStatus): 'amber' | 'gold' | 'emerald' | 'rose' | 'neutral' {
  if (status === 'Pending') return 'amber';
  if (status === 'Preparing') return 'gold';
  if (status === 'Ready') return 'emerald';
  if (status === 'Cancelled') return 'rose';
  return 'neutral';
}

/**
 * Derive customer profiles strictly from persisted orders.
 * Groups by normalized phone number when available, or by normalized name when phone is absent.
 * Never invents missing fields (phone, email, or address).
 */
export function buildCustomerDirectory(orders: Order[]): CustomerRecord[] {
  const sorted = [...orders].sort(
    (a, b) => parseOrderTime(b.createdAt) - parseOrderTime(a.createdAt)
  );

  const groups = new Map<string, Order[]>();

  for (const order of sorted) {
    const phoneKey = normalizePhoneKey(order.customerPhone);
    const nameKey = normalizeNameKey(order.customerName);

    let key: string;
    if (phoneKey) {
      key = `phone:${phoneKey}`;
    } else if (nameKey && nameKey !== 'guest' && nameKey !== 'walk-in guest') {
      key = `name:${nameKey}`;
    } else {
      // Keep anonymous walk-in orders without a phone separate per order so unrelated guests aren't merged
      key = `order:${order.id}`;
    }

    const list = groups.get(key);
    if (list) {
      list.push(order);
    } else {
      groups.set(key, [order]);
    }
  }

  const customers: CustomerRecord[] = [];
  for (const [id, custOrders] of groups.entries()) {
    const latest = custOrders[0];
    const displayName =
      custOrders.map((o) => o.customerName.trim()).find(Boolean) || 'Guest';
    const phone =
      custOrders.map((o) => (o.customerPhone || '').trim()).find(Boolean) || null;
    const deliveryAddress =
      custOrders.map((o) => (o.deliveryAddress || '').trim()).find(Boolean) || null;
    const emailCandidate = custOrders
      .map((o) => ((o as Order & { customerEmail?: string }).customerEmail || '').trim())
      .find(Boolean);

    const totalSpending = custOrders
      .filter((o) => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    customers.push({
      id,
      name: displayName,
      phone,
      email: emailCandidate || null,
      deliveryAddress,
      totalOrders: custOrders.length,
      totalSpending,
      lastOrderDate: latest.createdAt,
      orders: custOrders,
    });
  }

  return customers.sort(
    (a, b) => parseOrderTime(b.lastOrderDate) - parseOrderTime(a.lastOrderDate)
  );
}

export function filterCustomers(
  customers: CustomerRecord[],
  query: string
): CustomerRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  const qDigits = q.replace(/[^\d]/g, '');

  return customers.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.phone && c.phone.toLowerCase().includes(q)) return true;
    if (qDigits && c.phone && c.phone.replace(/[^\d]/g, '').includes(qDigits)) return true;
    if (c.email && c.email.toLowerCase().includes(q)) return true;
    return false;
  });
}

export const CustomersModule: React.FC<{
  orders: Order[];
  currency: string;
  globalSearch: string;
}> = ({ orders, currency, globalSearch }) => {
  const [localSearch, setLocalSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const customers = useMemo(() => buildCustomerDirectory(orders), [orders]);

  const effectiveQuery = localSearch.trim() || globalSearch.trim();
  const filtered = useMemo(
    () => filterCustomers(customers, effectiveQuery),
    [customers, effectiveQuery]
  );

  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId) ?? null
    : null;

  const repeatCustomersCount = customers.filter((c) => c.totalOrders > 1).length;
  const totalCustomerSpend = customers.reduce((sum, c) => sum + c.totalSpending, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Customers"
          value={String(customers.length)}
          subtitle="derived from order records"
          icon={<UserCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Repeat Guests"
          value={String(repeatCustomersCount)}
          delta={
            customers.length
              ? `${Math.round((repeatCustomersCount / customers.length) * 100)}%`
              : '0%'
          }
          subtitle="more than 1 order"
          icon={<ShoppingBag className="h-5 w-5" />}
        />
        <StatCard
          title="Total Customer Spend"
          value={formatCurrency(totalCustomerSpend, currency)}
          subtitle="excluding cancelled orders"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-4">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F3EBDD]/45" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search by customer name or phone number..."
            className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] py-2 pl-9 pr-3 text-sm text-[#F3EBDD] placeholder-[#F3EBDD]/40 focus:border-[#D7A65A] focus:outline-none"
          />
        </div>
        <p className="text-xs text-[#F3EBDD]/60">
          Showing <span className="font-semibold text-[#F3EBDD]">{filtered.length}</span> of{' '}
          {customers.length} customers
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-10 text-center">
          <UserCheck className="mx-auto h-8 w-8 text-[#D7A65A]/50" />
          <p className="mt-3 font-serif text-base font-semibold text-[#F3EBDD]">
            {customers.length === 0 ? 'No customer orders recorded yet' : 'No matching customers'}
          </p>
          <p className="mt-1 text-xs text-[#F3EBDD]/60">
            {customers.length === 0
              ? 'Customer profiles will appear here automatically as orders are placed.'
              : 'Try adjusting your name or phone number search.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922] md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#2C3D34] bg-[#101B17]/70 text-[11px] uppercase tracking-wider text-[#F3EBDD]/55">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">Customer</th>
                    <th className="px-5 py-3.5 font-semibold">Phone</th>
                    <th className="px-5 py-3.5 font-semibold">Email</th>
                    <th className="px-5 py-3.5 font-semibold">Orders</th>
                    <th className="px-5 py-3.5 font-semibold">Total Spending</th>
                    <th className="px-5 py-3.5 font-semibold">Last Order</th>
                    <th className="px-5 py-3.5 text-right font-semibold">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2C3D34]/70">
                  {filtered.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className="cursor-pointer transition hover:bg-[#101B17]/45"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-[#F3EBDD]">{customer.name}</p>
                        {customer.deliveryAddress && (
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-[#F3EBDD]/50">
                            {customer.deliveryAddress}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-[#F3EBDD]/80">
                        {customer.phone ?? <span className="text-[#F3EBDD]/40">Not provided</span>}
                      </td>
                      <td className="px-5 py-4 text-xs text-[#F3EBDD]/80">
                        {customer.email ?? <span className="text-[#F3EBDD]/40">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={customer.totalOrders > 1 ? 'gold' : 'neutral'}>
                          {customer.totalOrders} {customer.totalOrders === 1 ? 'order' : 'orders'}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#D7A65A]">
                        {formatCurrency(customer.totalSpending, currency)}
                      </td>
                      <td className="px-5 py-4 text-xs text-[#F3EBDD]/70">
                        {formatDate(customer.lastOrderDate)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerId(customer.id);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2C3D34] bg-[#101B17] px-3 py-1.5 text-xs font-medium text-[#F3EBDD] transition hover:border-[#D7A65A]/50 hover:text-[#D7A65A]"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedCustomerId(customer.id)}
                className="w-full rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-4 text-left transition hover:border-[#D7A65A]/45"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#F3EBDD]">{customer.name}</p>
                    <p className="mt-0.5 text-xs text-[#F3EBDD]/65">
                      {customer.phone ?? 'No phone provided'}
                    </p>
                    {customer.email && (
                      <p className="mt-0.5 text-xs text-[#F3EBDD]/60">{customer.email}</p>
                    )}
                  </div>
                  <Badge variant={customer.totalOrders > 1 ? 'gold' : 'neutral'}>
                    {customer.totalOrders} {customer.totalOrders === 1 ? 'order' : 'orders'}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#2C3D34] pt-3 text-xs">
                  <span className="text-[#F3EBDD]/60">{formatDate(customer.lastOrderDate)}</span>
                  <span className="font-semibold text-[#D7A65A]">
                    {formatCurrency(customer.totalSpending, currency)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Modal
        open={Boolean(selectedCustomer)}
        onClose={() => setSelectedCustomerId(null)}
        title={selectedCustomer?.name ?? 'Customer'}
        subtitle={
          selectedCustomer
            ? `${selectedCustomer.totalOrders} ${selectedCustomer.totalOrders === 1 ? 'order' : 'orders'} · ${formatCurrency(selectedCustomer.totalSpending, currency)} total spend`
            : undefined
        }
        maxWidth="max-w-2xl"
      >
        {selectedCustomer && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#2C3D34] bg-[#101B17] p-4 sm:grid-cols-2">
              <div className="flex items-center gap-2.5 text-xs">
                <Phone className="h-4 w-4 shrink-0 text-[#D7A65A]" />
                <div>
                  <p className="text-[#F3EBDD]/50">Phone</p>
                  <p className="font-medium text-[#F3EBDD]">
                    {selectedCustomer.phone ?? 'Not provided'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Mail className="h-4 w-4 shrink-0 text-[#D7A65A]" />
                <div>
                  <p className="text-[#F3EBDD]/50">Email</p>
                  <p className="font-medium text-[#F3EBDD]">
                    {selectedCustomer.email ?? 'Not collected on orders'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <Calendar className="h-4 w-4 shrink-0 text-[#D7A65A]" />
                <div>
                  <p className="text-[#F3EBDD]/50">Last Order</p>
                  <p className="font-medium text-[#F3EBDD]">
                    {formatDate(selectedCustomer.lastOrderDate)}
                  </p>
                </div>
              </div>
              {selectedCustomer.deliveryAddress && (
                <div className="flex items-center gap-2.5 text-xs">
                  <MapPin className="h-4 w-4 shrink-0 text-[#D7A65A]" />
                  <div className="min-w-0">
                    <p className="text-[#F3EBDD]/50">Latest Delivery Address</p>
                    <p className="truncate font-medium text-[#F3EBDD]">
                      {selectedCustomer.deliveryAddress}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-3 font-serif text-sm font-semibold text-[#F3EBDD]">
                Order History
              </h4>
              <div className="space-y-2.5">
                {selectedCustomer.orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-[#2C3D34] bg-[#101B17]/80 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#F3EBDD]">
                          {order.orderNumber}
                        </span>
                        <Badge variant={statusBadgeVariant(order.status)}>
                          {order.status}
                        </Badge>
                        <span className="text-xs text-[#F3EBDD]/55">
                          {order.orderType}
                          {order.tableNumber ? ` · ${order.tableNumber}` : ''}
                        </span>
                      </div>
                      <span className="font-semibold text-[#D7A65A]">
                        {formatCurrency(order.total, currency)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[#F3EBDD]/70">
                      {order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}
                    </p>
                    <p className="mt-1 text-[11px] text-[#F3EBDD]/45">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
