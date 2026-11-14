import React, { useState } from 'react';
import { Eye, Plus, ChevronRight, Printer } from 'lucide-react';
import { MenuItem, Order, OrderStatus } from '../types';
import { Badge, Modal } from '../components/ui/Primitives';
import { formatCurrency } from '../services/api';
import { printOrderReceipt } from '../utils/printReceipt';

const STATUS_FLOW: OrderStatus[] = ['Pending', 'Preparing', 'Ready', 'Served'];

export const OrdersModule: React.FC<{
  orders: Order[];
  menuItems: MenuItem[];
  currency: string;
  taxRatePercent: number;
  serviceChargePercent: number;
  restaurantName: string;
  globalSearch: string;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onCreateOrder: (order: Order) => void;
}> = ({ orders, menuItems, currency, taxRatePercent, serviceChargePercent, restaurantName, globalSearch, onUpdateStatus, onCreateOrder }) => {
  const [statusFilter, setStatusFilter] = useState<'All' | OrderStatus>('All');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [newCustomer, setNewCustomer] = useState('');
  const [newTable, setNewTable] = useState('T-01');
  const [newType, setNewType] = useState<Order['orderType']>('Dine-In');
  const [selectedDishId, setSelectedDishId] = useState(menuItems[0]?.id ?? '');
  const [qty, setQty] = useState(1);

  const badgeVariant = (s: OrderStatus) => {
    if (s === 'Pending') return 'amber';
    if (s === 'Preparing') return 'gold';
    if (s === 'Ready') return 'emerald';
    if (s === 'Cancelled') return 'rose';
    return 'neutral';
  };

  const nextStatus = (s: OrderStatus): OrderStatus | null => {
    const idx = STATUS_FLOW.indexOf(s);
    if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  };

  const q = globalSearch.toLowerCase();
  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === 'All' || o.status === statusFilter;
    const matchSearch =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.tableNumber.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const dish = menuItems.find((m) => m.id === selectedDishId) ?? menuItems[0];
    if (!dish) return;
    const subtotal = dish.price * qty;
    const tax = Number((subtotal * (taxRatePercent / 100)).toFixed(2));
    const serviceCharge = Number((subtotal * (serviceChargePercent / 100)).toFixed(2));
    const order: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: `ZST-${Math.floor(1050 + Math.random() * 900)}`,
      tableNumber: newType === 'Dine-In' ? newTable : 'Pickup',
      customerName: newCustomer.trim() || 'Walk-in Guest',
      orderType: newType,
      items: [{ menuItemId: dish.id, name: dish.name, quantity: qty, unitPrice: dish.price }],
      subtotal,
      tax,
      serviceCharge,
      total: Number((subtotal + tax + serviceCharge).toFixed(2)),
      status: 'Pending',
      createdAt: 'Just now',
    };
    onCreateOrder(order);
    setCreateOpen(false);
    setNewCustomer('');
    setQty(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['All', 'Pending', 'Preparing', 'Ready', 'Served', 'Cancelled'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                statusFilter === s
                  ? 'bg-[#D7A65A] text-[#101B17]'
                  : 'border border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/75 hover:text-[#F3EBDD]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" /> Manual Order
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#2C3D34] bg-[#101B17]/70 text-xs uppercase tracking-wider text-[#F3EBDD]/60">
              <tr>
                <th className="px-5 py-3.5">Order</th>
                <th className="px-5 py-3.5">Guest &amp; Table</th>
                <th className="px-5 py-3.5">Items</th>
                <th className="px-5 py-3.5">Total</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2C3D34]">
              {filtered.map((order) => {
                const next = nextStatus(order.status);
                return (
                  <tr key={order.id} className="transition hover:bg-[#101B17]/40">
                    <td className="px-5 py-4">
                      <p className="font-mono font-semibold text-[#D7A65A]">{order.orderNumber}</p>
                      <p className="text-xs text-[#F3EBDD]/55">{order.createdAt}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#F3EBDD]">{order.customerName}</p>
                      <p className="text-xs text-[#F3EBDD]/60">
                        {order.orderType} • {order.tableNumber}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-[#F3EBDD]/80">
                      {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#F3EBDD]">
                      {formatCurrency(order.total, currency)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={badgeVariant(order.status)}>{order.status}</Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {next && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(order.id, next)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#D7A65A]/15 px-2.5 py-1.5 text-xs font-medium text-[#D7A65A] hover:bg-[#D7A65A]/25"
                          >
                            Mark {next} <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-[#F3EBDD]/80 hover:text-[#D7A65A]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={`Order ${selectedOrder?.orderNumber ?? ''}`}
        subtitle={selectedOrder ? `${selectedOrder.orderType} • ${selectedOrder.tableNumber}` : undefined}
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-[#2C3D34] bg-[#101B17] p-4">
              <div>
                <p className="text-xs text-[#F3EBDD]/60">Customer</p>
                <p className="font-medium text-[#F3EBDD]">{selectedOrder.customerName}</p>
              </div>
              <Badge variant={badgeVariant(selectedOrder.status)}>{selectedOrder.status}</Badge>
            </div>
            <div className="space-y-2">
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-[#F3EBDD]/85">
                    {item.quantity}× {item.name}
                  </span>
                  <span className="text-[#F3EBDD]">
                    {formatCurrency(item.quantity * item.unitPrice, currency)}
                  </span>
                </div>
              ))}
            </div>
            {selectedOrder.notes && (
              <div className="rounded-xl border border-[#D7A65A]/30 bg-[#D7A65A]/10 p-3 text-xs text-[#F3EBDD]">
                Kitchen Note: {selectedOrder.notes}
              </div>
            )}
            <div className="space-y-1 border-t border-[#2C3D34] pt-3 text-sm">
              <div className="flex justify-between text-[#F3EBDD]/65">
                <span>Subtotal</span>
                <span>{formatCurrency(selectedOrder.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-[#F3EBDD]/65">
                <span>Tax</span>
                <span>{formatCurrency(selectedOrder.tax, currency)}</span>
              </div>
              {(selectedOrder.serviceCharge ?? 0) > 0 && (
                <div className="flex justify-between text-[#F3EBDD]/65">
                  <span>Service charge</span>
                  <span>{formatCurrency(selectedOrder.serviceCharge ?? 0, currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-serif text-base font-bold text-[#D7A65A]">
                <span>Total</span>
                <span>{formatCurrency(selectedOrder.total, currency)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2C3D34] pt-4">
              <button
                type="button"
                onClick={() => {
                  const opened = printOrderReceipt(selectedOrder, currency, restaurantName);
                  if (!opened) window.alert('Allow pop-ups in your browser to print the receipt.');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[#D7A65A]/35 bg-[#D7A65A]/10 px-3.5 py-2 text-xs font-semibold text-[#D7A65A] hover:bg-[#D7A65A]/15"
              >
                <Printer className="h-3.5 w-3.5" /> Print Receipt
              </button>
              <span className="text-[11px] text-[#F3EBDD]/45">Thermal receipt layout · 80 mm</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {(['Pending', 'Preparing', 'Ready', 'Served', 'Cancelled'] as OrderStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    onUpdateStatus(selectedOrder.id, st);
                    setSelectedOrder({ ...selectedOrder, status: st });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    selectedOrder.status === st
                      ? 'bg-[#D7A65A] text-[#101B17]'
                      : 'border border-[#2C3D34] bg-[#101B17] text-[#F3EBDD]/75'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Manual Order">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Guest Name</label>
              <input
                type="text"
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="Walk-in Guest"
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Order Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as Order['orderType'])}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              >
                <option value="Dine-In">Dine-In</option>
                <option value="Takeaway">Takeaway</option>
                <option value="Delivery">Delivery</option>
              </select>
            </div>
          </div>
          {newType === 'Dine-In' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Table</label>
              <input
                type="text"
                value={newTable}
                onChange={(e) => setNewTable(e.target.value)}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Dish</label>
              <select
                value={selectedDishId}
                onChange={(e) => setSelectedDishId(e.target.value)}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              >
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatCurrency(m.price, currency)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Qty</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17]"
            >
              Create Order
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
