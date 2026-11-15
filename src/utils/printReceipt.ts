import type { Order } from '../types';
import { formatCurrency, formatDhakaDateTime } from '../services/api';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);

function formatReceiptDate(value: string): string {
  return formatDhakaDateTime(value);
}

export function printOrderReceipt(
  order: Order,
  currency: string,
  restaurantName = 'ZESTRO'
): boolean {
  const printWindow = window.open('', '_blank', 'width=440,height=780');
  if (!printWindow) return false;

  const itemRows = order.items
    .map((item) => {
      const details: string[] = [];
      if (item.variantLabel) details.push(`Size: ${escapeHtml(item.variantLabel)}`);
      if (item.selectedSides && item.selectedSides.length > 0) {
        details.push(`Sides: ${escapeHtml(item.selectedSides.join(', '))}`);
      }
      if (item.customisations && item.customisations.length > 0) {
        details.push(
          `Add-ons: ${escapeHtml(item.customisations.map((c) => c.optionName).join(', '))}`
        );
      }
      if (item.specialInstructions) {
        details.push(`Note: ${escapeHtml(item.specialInstructions)}`);
      }
      return `
    <div class="item">
      <div>
        <strong>${item.quantity} × ${escapeHtml(item.name)}</strong>
        <small>${formatCurrency(item.unitPrice, currency)} each</small>
        ${details.map((line) => `<small>${line}</small>`).join('')}
      </div>
      <b>${formatCurrency(item.quantity * item.unitPrice, currency)}</b>
    </div>
  `;
    })
    .join('');

  const phoneRow = order.customerPhone
    ? `<div class="meta"><span>Phone</span><span>${escapeHtml(order.customerPhone)}</span></div>`
    : '';
  const addressRow =
    order.orderType === 'Delivery' && order.deliveryAddress
      ? `<div class="meta"><span>Address</span><span style="text-align:right;max-width:200px">${escapeHtml(order.deliveryAddress)}</span></div>`
      : '';
  const discountRow =
    (order.discount ?? 0) > 0
      ? `<div class="meta"><span>Discount${order.promoCode ? ` (${escapeHtml(order.promoCode)})` : ''}</span><span>-${formatCurrency(order.discount ?? 0, currency)}</span></div>`
      : '';
  const taxRow =
    order.tax > 0
      ? `<div class="meta"><span>Tax</span><span>${formatCurrency(order.tax, currency)}</span></div>`
      : '';
  const serviceRow =
    (order.serviceCharge ?? 0) > 0
      ? `<div class="meta"><span>Service charge</span><span>${formatCurrency(order.serviceCharge ?? 0, currency)}</span></div>`
      : '';
  const deliveryRow =
    (order.deliveryFee ?? 0) > 0
      ? `<div class="meta"><span>Delivery fee</span><span>${formatCurrency(order.deliveryFee ?? 0, currency)}</span></div>`
      : '';

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt ${escapeHtml(order.orderNumber)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#fff;color:#171717;font:13px/1.45 Arial,sans-serif}
    .receipt{max-width:360px;margin:0 auto}.center{text-align:center}.brand{font-size:24px;letter-spacing:3px;font-weight:800;margin:0 0 4px}
    .muted{color:#666}.rule{border:0;border-top:1px dashed #aaa;margin:14px 0}.meta{display:flex;justify-content:space-between;gap:12px;margin:4px 0}
    .items{display:grid;gap:12px}.item{display:flex;justify-content:space-between;gap:12px}.item small{display:block;color:#555;font-size:11.5px}.item b{white-space:nowrap}
    .total{font-size:17px;font-weight:800}.foot{margin-top:22px;text-align:center;color:#555;font-size:11px}
    .actions{margin-top:18px;text-align:center}.print-btn{padding:8px 16px;border:1px solid #171717;border-radius:6px;background:#171717;color:#fff;font-size:12px;font-weight:700;cursor:pointer}
    @page{size:80mm auto;margin:4mm}@media print{body{padding:0}.receipt{max-width:none}.no-print{display:none!important}}
  </style></head><body><main class="receipt">
    <header class="center"><h1 class="brand">${escapeHtml(restaurantName)}</h1><div class="muted">Official Order Receipt</div></header>
    <hr class="rule"><div class="meta"><span>Order</span><strong>${escapeHtml(order.orderNumber)}</strong></div>
    <div class="meta"><span>Date</span><span>${escapeHtml(formatReceiptDate(order.createdAt))}</span></div>
    <div class="meta"><span>Status</span><span>${escapeHtml(order.status)}</span></div>
    <div class="meta"><span>Guest</span><span>${escapeHtml(order.customerName)}</span></div>
    ${phoneRow}
    <div class="meta"><span>Channel</span><span>${escapeHtml(order.orderType)} · ${escapeHtml(order.tableNumber)}</span></div>
    ${addressRow}
    <hr class="rule"><section class="items">${itemRows}</section><hr class="rule">
    <div class="meta"><span>Subtotal</span><span>${formatCurrency(order.subtotal, currency)}</span></div>
    ${discountRow}
    ${taxRow}
    ${serviceRow}
    ${deliveryRow}
    <hr class="rule"><div class="meta total"><span>Total</span><span>${formatCurrency(order.total, currency)}</span></div>
    ${order.notes ? `<hr class="rule"><p><strong>Guest Note:</strong> ${escapeHtml(order.notes)}</p>` : ''}
    <footer class="foot">Thank you for dining with ${escapeHtml(restaurantName)}.<br>We look forward to serving you again.</footer>
    <div class="actions no-print"><button id="zestro-print-trigger" type="button" class="print-btn">Print Receipt</button></div>
  </main></body></html>`);
  printWindow.document.close();

  // Trigger print from parent execution context so strict CSP (script-src 'self') never blocks printing.
  const triggerBtn = printWindow.document.getElementById('zestro-print-trigger');
  triggerBtn?.addEventListener('click', () => {
    printWindow.focus();
    printWindow.print();
  });

  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // Manual button remains available if automatic print dialog is deferred by the browser.
    }
  }, 150);

  return true;
}
