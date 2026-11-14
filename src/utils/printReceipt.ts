import type { Order } from '../types';
import { formatCurrency } from '../services/api';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);

export function printOrderReceipt(order: Order, currency: string, restaurantName = 'ZESTRO'): boolean {
  const printWindow = window.open('', '_blank', 'width=440,height=760');
  if (!printWindow) return false;

  const itemRows = order.items.map((item) => `
    <div class="item">
      <div><strong>${item.quantity} × ${escapeHtml(item.name)}</strong><small>${formatCurrency(item.unitPrice, currency)} each</small></div>
      <b>${formatCurrency(item.quantity * item.unitPrice, currency)}</b>
    </div>
  `).join('');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt ${escapeHtml(order.orderNumber)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#fff;color:#171717;font:13px/1.45 Arial,sans-serif}
    .receipt{max-width:360px;margin:0 auto}.center{text-align:center}.brand{font-size:25px;letter-spacing:3px;font-weight:800;margin:0 0 4px}
    .muted{color:#666}.rule{border:0;border-top:1px dashed #aaa;margin:14px 0}.meta{display:flex;justify-content:space-between;gap:12px;margin:4px 0}
    .items{display:grid;gap:12px}.item{display:flex;justify-content:space-between;gap:12px}.item small{display:block;color:#666}.item b{white-space:nowrap}
    .total{font-size:17px;font-weight:800}.foot{margin-top:22px;text-align:center;color:#555;font-size:11px}
    @page{size:80mm auto;margin:4mm}@media print{body{padding:0}.receipt{max-width:none}}
  </style></head><body><main class="receipt">
    <header class="center"><h1 class="brand">${escapeHtml(restaurantName)}</h1><div class="muted">Order receipt</div></header>
    <hr class="rule"><div class="meta"><span>Order</span><strong>${escapeHtml(order.orderNumber)}</strong></div>
    <div class="meta"><span>Date</span><span>${escapeHtml(order.createdAt)}</span></div>
    <div class="meta"><span>Guest</span><span>${escapeHtml(order.customerName)}</span></div>
    <div class="meta"><span>Type / Table</span><span>${escapeHtml(order.orderType)} · ${escapeHtml(order.tableNumber)}</span></div>
    <hr class="rule"><section class="items">${itemRows}</section><hr class="rule">
    <div class="meta"><span>Subtotal</span><span>${formatCurrency(order.subtotal, currency)}</span></div>
    <div class="meta"><span>Tax</span><span>${formatCurrency(order.tax, currency)}</span></div>
    ${(order.serviceCharge ?? 0) > 0 ? `<div class="meta"><span>Service charge</span><span>${formatCurrency(order.serviceCharge ?? 0, currency)}</span></div>` : ''}
    <hr class="rule"><div class="meta total"><span>Total</span><span>${formatCurrency(order.total, currency)}</span></div>
    ${order.notes ? `<hr class="rule"><p><strong>Note:</strong> ${escapeHtml(order.notes)}</p>` : ''}
    <footer class="foot">Thank you for dining with us.<br>We hope to see you again.</footer>
  </main><script>window.addEventListener('load',()=>{window.focus();window.print();});</script></body></html>`);
  printWindow.document.close();
  return true;
}
