import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before } from 'node:test';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WORKER_ROOT, '..');

describe('Customers directory derivation & search', () => {
  let buildCustomerDirectory;
  let filterCustomers;

  before(async () => {
    const tmp = fs.mkdtempSync(path.join(WORKER_ROOT, '.tmp-cust-'));
    try {
      const out = path.join(tmp, 'customers.mjs');
      await esbuild.build({
        entryPoints: [path.join(REPO_ROOT, 'src/modules/CustomersModule.tsx')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        external: ['react', 'lucide-react'],
        outfile: out,
        logLevel: 'silent',
      });
      ({ buildCustomerDirectory, filterCustomers } = await import(`file://${out}`));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  const sampleOrders = [
    {
      id: 'o1',
      orderNumber: 'ZST-001',
      tableNumber: 'T-01',
      customerName: 'Rahim Ahmed',
      customerPhone: '+880 1712-345678',
      orderType: 'Dine-In',
      items: [{ menuItemId: 'm1', name: 'Burger', quantity: 1, unitPrice: 450 }],
      subtotal: 450,
      tax: 22.5,
      total: 472.5,
      status: 'Served',
      createdAt: '2026-11-10T12:00:00Z',
    },
    {
      id: 'o2',
      orderNumber: 'ZST-002',
      tableNumber: 'Delivery',
      customerName: 'Rahim Ahmed',
      customerPhone: '+8801712345678',
      deliveryAddress: 'Road 7, Sylhet',
      orderType: 'Delivery',
      items: [{ menuItemId: 'm2', name: 'Latte', quantity: 2, unitPrice: 250 }],
      subtotal: 500,
      tax: 25,
      total: 525,
      status: 'Served',
      createdAt: '2026-11-14T18:30:00Z',
    },
    {
      id: 'o3',
      orderNumber: 'ZST-003',
      tableNumber: 'Pickup',
      customerName: 'Rahim Ahmed',
      customerPhone: '+8801712345678',
      orderType: 'Takeaway',
      items: [{ menuItemId: 'm1', name: 'Burger', quantity: 1, unitPrice: 450 }],
      subtotal: 450,
      tax: 22.5,
      total: 472.5,
      status: 'Cancelled',
      createdAt: '2026-11-15T09:00:00Z',
    },
    {
      id: 'o4',
      orderNumber: 'ZST-004',
      tableNumber: 'Walk-in',
      customerName: 'Walk-in Guest',
      customerPhone: '',
      orderType: 'Dine-In',
      items: [{ menuItemId: 'm2', name: 'Latte', quantity: 1, unitPrice: 250 }],
      subtotal: 250,
      tax: 12.5,
      total: 262.5,
      status: 'Served',
      createdAt: '2026-11-13T10:00:00Z',
    },
    {
      id: 'o5',
      orderNumber: 'ZST-005',
      tableNumber: 'Walk-in',
      customerName: 'Walk-in Guest',
      customerPhone: '',
      orderType: 'Dine-In',
      items: [{ menuItemId: 'm2', name: 'Latte', quantity: 1, unitPrice: 250 }],
      subtotal: 250,
      tax: 12.5,
      total: 262.5,
      status: 'Served',
      createdAt: '2026-11-12T10:00:00Z',
    },
  ];

  it('groups by normalized phone, excludes cancelled spend, and never invents missing fields', () => {
    const list = buildCustomerDirectory(sampleOrders);
    assert.equal(list.length, 3);

    const rahim = list[0];
    assert.equal(rahim.name, 'Rahim Ahmed');
    assert.equal(rahim.phone, '+8801712345678');
    assert.equal(rahim.email, null);
    assert.equal(rahim.deliveryAddress, 'Road 7, Sylhet');
    assert.equal(rahim.totalOrders, 3);
    assert.equal(rahim.totalSpending, 997.5);
    assert.equal(rahim.lastOrderDate, '2026-11-15T09:00:00Z');
    assert.equal(rahim.orders.length, 3);

    const walkIn = list[1];
    assert.equal(walkIn.phone, null);
    assert.equal(walkIn.email, null);
    assert.equal(walkIn.deliveryAddress, null);
    assert.equal(walkIn.totalOrders, 1);
  });

  it('filters customers by name or phone number', () => {
    const list = buildCustomerDirectory(sampleOrders);
    assert.equal(filterCustomers(list, 'rahim').length, 1);
    assert.equal(filterCustomers(list, '171234').length, 1);
    assert.equal(filterCustomers(list, 'walk-in').length, 2);
    assert.equal(filterCustomers(list, 'nonexistent').length, 0);
  });
});
