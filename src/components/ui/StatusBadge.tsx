import React from 'react';
import { Badge } from './Primitives';
import type { OrderStatus, TableStatus, WaiterCallStatus } from '../../types';

type Variant = React.ComponentProps<typeof Badge>['variant'];

/** One mapping from every status in the app to a badge color. */
const STATUS_VARIANTS: Record<string, Variant> = {
  // Orders
  Pending: 'amber',
  Preparing: 'info',
  Ready: 'emerald',
  Served: 'neutral',
  Cancelled: 'rose',
  // Tables
  Available: 'emerald',
  Occupied: 'amber',
  Reserved: 'info',
  Cleaning: 'neutral',
  // Waiter calls
  Incoming: 'rose',
  Acknowledged: 'amber',
  Resolved: 'emerald',
};

export const StatusBadge: React.FC<{ status: OrderStatus | TableStatus | WaiterCallStatus | string }> = ({ status }) => (
  <Badge variant={STATUS_VARIANTS[status] ?? 'neutral'}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {status}
  </Badge>
);
