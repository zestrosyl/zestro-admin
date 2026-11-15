import React, { useEffect, useState } from 'react';
import { Eye, Plus, ChevronRight, Printer, Trash2, Check, X } from 'lucide-react';
import { MenuItem, Order, OrderLineItem, OrderStatus, RestaurantTable } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';
import { formatCurrency, formatDhakaDateTime } from '../services/api';
import { printOrderReceipt } from '../utils/printReceipt';

const STATUS_FLOW: OrderStatus[] = ['Pending', 'Preparing', 'Ready', 'Served'];

export const OrdersModule: React.FC<{
  orders: Order[];
  menuItems: MenuItem[];
  tables: RestaurantTable[];
  currency: string;
  taxRatePercent: number;
  serviceChargePercent: number;
  deliveryFeeAmount?: number;
  restaurantName: string;
  globalSearch: string;
  canOperate?: boolean;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void> | void;
  onCreateOrder: (payload: {
    tableId?: string;
    tableNumber?: string;
    customerName: string;
    customerPhone?: string;
    deliveryAddress?: string;
    orderType: Order['orderType'];
    notes?: string;
    items: OrderLineItem[];
  }) => Promise<boolean> | void;
}> = ({
  orders,
  menuItems,
  tables,
  currency,
  taxRatePercent,
  serviceChargePercent,
  deliveryFeeAmount = 0,
  restaurantName,
  globalSearch,
  canOperate = true,
  onUpdateStatus,
  onCreateOrder,
}) => {
  const [statusFilter, setStatusFilter] = useState<'All' | OrderStatus>('All');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null);

  const [newCustomer, setNewCustomer] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newTableId, setNewTableId] = useState(tables[0]?.id ?? '');
  const [newType, setNewType] = useState<Order['orderType']>('Dine-In');
  const [draftLines, setDraftLines] = useState<Array<{ menuItemId: string; quantity: number }>>([]);
  const [selectedDishId, setSelectedDishId] = useState(menuItems[0]?.id ?? '');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!newTableId && tables[0]?.id) setNewTableId(tables[0].id);
  }, [tables, newTableId]);

  useEffect(() => {
    if (!selectedDishId && menuItems[0]?.id) setSelectedDishId(menuItems[0].id);
  }, [menuItems, selectedDishId]);

  const selectedOrder = selectedOrderId ? orders.find((o) => o.id === selectedOrderId) ?? null : null;

  const badgeVariant = (s: OrderStatus) => {
    if (s === 'Pending') return 'amber';
    if (s === 'Preparing') return 'neutral';
    if (s === 'Ready' || s === 'Served') return 'emerald';
    if (s === 'Cancelled') return 'rose';
    return 'neutral';
  };

  const nextStatus = (s: OrderStatus): OrderStatus | null => {
    const idx = STATUS_FLOW.indexOf(s);
    if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  };

  const triggerStatusUpdate = async (orderId: string, next: OrderStatus) => {
    if (updatingOrderId === orderId) return;
    setUpdatingOrderId(orderId);
    try {
      await onUpdateStatus(orderId, next);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const q = globalSearch.toLowerCase();
  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === 'All' || o.status === statusFilter;
    const matchSearch =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.tableNumber.toLowerCase().includes(q) ||
      (o.customerPhone || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const addDraftLine = () => {
    const dish = menuItems.find((m) => m.id === selectedDishId);
    if (!dish || qty < 1) return;
    setDraftLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === dish.id);
      if (existing) {
        return prev.map((l) => (l.menuItemId === dish.id ? { ...l, quantity: l.quantity + qty } : l));
      }
      return [...prev, { menuItemId: dish.id, quantity: qty }];
    });
    setQty(1);
  };

  const effectiveLines =
    draftLines.length > 0
      ? draftLines
      : selectedDishId
      ? [{ menuItemId: selectedDishId, quantity: qty }]
      : [];

  const draftSubtotal = effectiveLines.reduce((sum, line) => {
    const dish = menuItems.find((m) => m.id === line.menuItemId);
    return sum + (dish ? dish.price * line.quantity : 0);
  }, 0);
  const draftTax = Number((draftSubtotal * (taxRatePercent / 100)).toFixed(2));
  const draftService = Number((draftSubtotal * (serviceChargePercent / 100)).toFixed(2));
  const draftDelivery = newType === 'Delivery' ? deliveryFeeAmount : 0;
  const draftTotal = Number((draftSubtotal + draftTax + draftService + draftDelivery).toFixed(2));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating || effectiveLines.length === 0) return;
    const itemsPayload: OrderLineItem[] = effectiveLines
      .map((line) => {
        const dish = menuItems.find((m) => m.id === line.menuItemId);
        if (!dish) return null;
        return {
          menuItemId: dish.id,
          name: dish.name,
          quantity: line.quantity,
          unitPrice: dish.price,
        };
      })
      .filter((x): x is OrderLineItem => Boolean(x));

    if (itemsPayload.length === 0) return;

    const chosenTable = tables.find((t) => t.id === newTableId);
    setCreating(true);
    try {
      const ok = await onCreateOrder({
        tableId: newType === 'Dine-In' ? chosenTable?.id : undefined,
        tableNumber:
          newType === 'Dine-In' ? chosenTable?.number || 'Dine-In' : newType,
        customerName: newCustomer.trim() || 'Walk-in Guest',
        customerPhone: newPhone.trim(),
        deliveryAddress: newType === 'Delivery' ? newAddress.trim() : '',
        orderType: newType,
        notes: newNotes.trim(),
        items: itemsPayload,
      });
      if (ok !== false) {
        setCreateOpen(false);
        setNewCustomer('');
        setNewPhone('');
        setNewAddress('');
        setNewNotes('');
        setDraftLines([]);
        setQty(1);
      }
    } finally {
      setCreating(false);
    }
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
              className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
                statusFilter === s
                  ? 'bg-[#111111] text-white'
                  : 'border border-[#E5E7EB] bg-white text-neutral-600 hover:bg-[#F5F5F5] hover:text-[#111111]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {canOperate && (
          <button
            type="button"
            disabled={menuItems.length === 0}
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-45"
            title={menuItems.length === 0 ? 'Add at least one menu dish before creating an order' : undefined}
          >
            <Plus className="h-4 w-4" /> Manual Order
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-base font-semibold text-[#111111]">
              {orders.length === 0 ? 'No live orders yet' : 'No orders match this filter'}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {orders.length === 0
                ? 'Customer orders placed on the website or QR menu appear here automatically.'
                : 'Switch status tabs or clear the search bar to see all orders.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F5] text-xs font-medium uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-3.5">Order</th>
                  <th className="px-5 py-3.5">Guest &amp; Channel</th>
                  <th className="px-5 py-3.5">Items</th>
                  <th className="px-5 py-3.5">Total</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filtered.map((order) => {
                  const next = nextStatus(order.status);
                  const isUpdating = updatingOrderId === order.id;
                  return (
                    <tr key={order.id} className="transition hover:bg-[#F5F5F5]/60">
                      <td className="px-5 py-4">
                        <p className="font-mono font-semibold text-[#111111]">#{order.orderNumber}</p>
                        <p className="text-xs text-neutral-500">{formatDhakaDateTime(order.createdAt)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-[#111111]">{order.customerName}</p>
                        <p className="text-xs text-neutral-500">
                          {order.orderType} · {order.tableNumber}
                          {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-neutral-600">
                        {order.items
                          .map(
                            (i) =>
                              `${i.quantity}× ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`
                          )
                          .join(', ')}
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#111111]">
                        {formatCurrency(order.total, currency)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={badgeVariant(order.status)}>{order.status}</Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canOperate && order.status === 'Pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => triggerStatusUpdate(order.id, 'Preparing')}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" /> Accept
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => setRejectTarget(order)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          {canOperate && order.status !== 'Pending' && next && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => triggerStatusUpdate(order.id, next)}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#111111] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                            >
                              Mark {next} <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedOrderId(order.id)}
                            className="rounded-lg border border-[#E5E7EB] bg-white p-2 text-neutral-600 hover:bg-[#F5F5F5] hover:text-[#111111]"
                            aria-label={`View ${order.orderNumber}`}
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
        )}
      </div>

      <Modal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrderId(null)}
        title={`Order #${selectedOrder?.orderNumber ?? ''}`}
        subtitle={
          selectedOrder
            ? `${selectedOrder.orderType} · ${selectedOrder.tableNumber} · ${formatDhakaDateTime(selectedOrder.createdAt)}`
            : undefined
        }
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-4">
              <div className="space-y-0.5">
                <p className="text-xs text-neutral-500">Customer</p>
                <p className="font-medium text-[#111111]">{selectedOrder.customerName}</p>
                {selectedOrder.customerPhone && (
                  <p className="text-xs text-neutral-600">{selectedOrder.customerPhone}</p>
                )}
                {selectedOrder.deliveryAddress && (
                  <p className="text-xs text-neutral-700">{selectedOrder.deliveryAddress}</p>
                )}
              </div>
              <Badge variant={badgeVariant(selectedOrder.status)}>{selectedOrder.status}</Badge>
            </div>
            <div className="space-y-2">
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-[#E5E7EB] bg-white p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-[#111111]">
                      {item.quantity}× {item.name}
                      {item.variantLabel ? ` (${item.variantLabel})` : ''}
                    </span>
                    <span className="font-medium text-[#111111]">
                      {formatCurrency(item.quantity * item.unitPrice, currency)}
                    </span>
                  </div>
                  {item.selectedSides && item.selectedSides.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Sides: {item.selectedSides.join(', ')}
                    </p>
                  )}
                  {item.customisations && item.customisations.length > 0 && (
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Add-ons: {item.customisations.map((c) => c.optionName).join(', ')}
                    </p>
                  )}
                  {item.specialInstructions && (
                    <p className="mt-0.5 text-xs text-amber-700">
                      Note: {item.specialInstructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {selectedOrder.notes && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Kitchen / Guest Note: {selectedOrder.notes}
              </div>
            )}
            <div className="space-y-1 border-t border-[#E5E7EB] pt-3 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>{formatCurrency(selectedOrder.subtotal, currency)}</span>
              </div>
              {(selectedOrder.discount ?? 0) > 0 && (
                <div className="flex justify-between text-[#16A34A]">
                  <span>
                    Discount{selectedOrder.promoCode ? ` (${selectedOrder.promoCode})` : ''}
                  </span>
                  <span>-{formatCurrency(selectedOrder.discount ?? 0, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600">
                <span>Tax</span>
                <span>{formatCurrency(selectedOrder.tax, currency)}</span>
              </div>
              {(selectedOrder.serviceCharge ?? 0) > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span>Service charge</span>
                  <span>{formatCurrency(selectedOrder.serviceCharge ?? 0, currency)}</span>
                </div>
              )}
              {(selectedOrder.deliveryFee ?? 0) > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span>Delivery fee</span>
                  <span>{formatCurrency(selectedOrder.deliveryFee ?? 0, currency)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-bold text-[#111111]">
                <span>Total</span>
                <span>{formatCurrency(selectedOrder.total, currency)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] pt-4">
              <button
                type="button"
                onClick={() => {
                  const opened = printOrderReceipt(selectedOrder, currency, restaurantName);
                  if (!opened) window.alert('Allow pop-ups in your browser to print the receipt.');
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-neutral-200"
              >
                <Printer className="h-3.5 w-3.5" /> Print Receipt
              </button>
              <span className="text-[11px] text-neutral-400">Thermal receipt layout · 80 mm</span>
            </div>
            {canOperate && (
              <div className="flex flex-wrap gap-2 pt-2">
                {(['Pending', 'Preparing', 'Ready', 'Served', 'Cancelled'] as OrderStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={updatingOrderId === selectedOrder.id || selectedOrder.status === st}
                    onClick={() => triggerStatusUpdate(selectedOrder.id, st)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
                      selectedOrder.status === st
                        ? 'bg-[#111111] text-white'
                        : 'border border-[#E5E7EB] bg-white text-neutral-700 hover:bg-[#F5F5F5]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Manual Order"
        subtitle="Creates a live restaurant order"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">Guest Name</label>
              <input
                type="text"
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="Walk-in Guest"
                className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-[#111111]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">Phone (+880)</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+880 17..."
                className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-[#111111]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">Order Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as Order['orderType'])}
                className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-[#111111]"
              >
                <option value="Dine-In">Dine-In</option>
                <option value="Takeaway">Takeaway</option>
                <option value="Delivery">Delivery</option>
              </select>
            </div>
            {newType === 'Dine-In' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-600">Table</label>
                {tables.length > 0 ? (
                  <select
                    value={newTableId}
                    onChange={(e) => setNewTableId(e.target.value)}
                    className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-[#111111]"
                  >
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.number} ({t.zone})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value="Dine-In (no tables created yet)"
                    className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-neutral-400"
                  />
                )}
              </div>
            )}
          </div>

          {newType === 'Delivery' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600">Delivery Address</label>
              <input
                type="text"
                required
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="House, Road, Area..."
                className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-[#111111]"
              />
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] p-3.5">
            <label className="block text-xs font-medium text-neutral-600">Order Items</label>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedDishId}
                onChange={(e) => setSelectedDishId(e.target.value)}
                className="min-w-[180px] flex-1 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111111]"
              >
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatCurrency(m.price, currency)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={50}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-20 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111111]"
              />
              <button
                type="button"
                onClick={addDraftLine}
                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-neutral-100"
              >
                + Add Line
              </button>
            </div>

            {draftLines.length > 0 && (
              <div className="space-y-1.5 border-t border-[#E5E7EB] pt-2">
                {draftLines.map((line) => {
                  const dish = menuItems.find((m) => m.id === line.menuItemId);
                  if (!dish) return null;
                  return (
                    <div key={line.menuItemId} className="flex items-center justify-between text-xs">
                      <span className="text-[#111111]">
                        {line.quantity}× {dish.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#111111]">
                          {formatCurrency(dish.price * line.quantity, currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftLines((prev) => prev.filter((l) => l.menuItemId !== line.menuItemId))
                          }
                          className="text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between border-t border-[#E5E7EB] pt-2 text-xs font-semibold text-[#111111]">
              <span>Estimated Total (incl. tax/charges)</span>
              <span>{formatCurrency(draftTotal, currency)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Kitchen Notes</label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Allergies, pacing, or plating requests..."
              className="w-full rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2 text-sm text-[#111111]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm text-[#111111]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-[#16A34A] px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {creating ? 'Submitting...' : 'Submit Order'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onCancel={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) {
            void triggerStatusUpdate(rejectTarget.id, 'Cancelled');
            setRejectTarget(null);
          }
        }}
        title="Reject this order?"
        message={
          rejectTarget
            ? `Order #${rejectTarget.orderNumber} from ${rejectTarget.customerName} will be marked as Cancelled.`
            : ''
        }
        confirmLabel="Reject Order"
      />
    </div>
  );
};
