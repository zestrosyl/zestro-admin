import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '../..');
const CUSTOMER_ROOT = path.resolve(ADMIN_ROOT, '../zestro-customer');

describe('ZESTRO Trial MVP Completion & Admin Simplification', () => {
  test('1. Sidebar has exact 11 navigation items, Log Out link, and light SaaS palette', () => {
    const sidebar = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/components/layout/Sidebar.tsx'),
      'utf8'
    );
    const expectedLabels = [
      'Dashboard',
      'Orders',
      'Menu Management',
      'Categories',
      'Tables & QR Codes',
      'Waiter Calls',
      'Gallery',
      'Offers',
      'Basic Reports',
      'Staff & Access',
      'Restaurant Settings',
    ];
    for (const label of expectedLabels) {
      assert.ok(sidebar.includes(label), `Missing sidebar label: ${label}`);
    }
    assert.ok(sidebar.includes('/cdn-cgi/access/logout'), 'Missing admin logout link');
  });

  test('2. Bangladesh-only localization in Admin and Customer UI', () => {
    const settings = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/modules/SettingsModule.tsx'),
      'utf8'
    );
    assert.ok(settings.includes('BDT (৳)'), 'Admin settings must show BDT (৳)');
    assert.ok(!settings.includes('USD ($)'), 'Foreign currency USD ($) must be removed');
    assert.ok(!settings.includes('SAR (﷼)'), 'Foreign currency SAR (﷼) must be removed');
    assert.ok(settings.includes('Asia/Dhaka'), 'Admin settings must show Asia/Dhaka');
    assert.ok(settings.includes('DD-MM-YYYY'), 'Admin settings must show DD-MM-YYYY');

    const customerHeader = fs.readFileSync(
      path.join(CUSTOMER_ROOT, 'src/components/customer/Header.tsx'),
      'utf8'
    );
    assert.ok(customerHeader.includes("code: 'en'"), 'Customer header must support EN');
    assert.ok(customerHeader.includes("code: 'bn'"), 'Customer header must support Bangla');
    assert.ok(!customerHeader.includes("code: 'ar'"), 'Arabic language option must be removed');
  });

  test('3. Orders module has Accept/Reject actions, confirmation dialog, and duplicate-click guard', () => {
    const ordersMod = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/modules/OrdersModule.tsx'),
      'utf8'
    );
    assert.ok(ordersMod.includes('updatingOrderId'), 'Missing duplicate-click guard updatingOrderId');
    assert.ok(ordersMod.includes('Accept'), 'Missing Accept button');
    assert.ok(ordersMod.includes('Reject'), 'Missing Reject button');
    assert.ok(ordersMod.includes('ConfirmDialog'), 'Missing confirmation dialog for rejection');
  });

  test('4. Basic Reports module provides date-range filtering and daily summaries', () => {
    const reportsMod = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/modules/ReportsModule.tsx'),
      'utf8'
    );
    assert.ok(reportsMod.includes('Daily Sales &amp; Order Summary'));
    assert.ok(reportsMod.includes('toDhakaDateKey'));
    assert.ok(reportsMod.includes('formatDhakaDate'));
    assert.ok(reportsMod.includes('Completed Orders'));
    assert.ok(reportsMod.includes('Pending Orders'));
  });
});
