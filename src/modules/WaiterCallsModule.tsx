import React, { useEffect, useState } from 'react';
import { BellRing, Check, CheckCheck, Plus } from 'lucide-react';
import { RestaurantTable, WaiterCall, WaiterCallStatus, WaiterCallType } from '../types';
import { Badge, Modal } from '../components/ui/Primitives';

function formatCallTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const mins = Math.round((Date.now() - parsed.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const WaiterCallsModule: React.FC<{
  calls: WaiterCall[];
  tables: RestaurantTable[];
  canOperate?: boolean;
  onUpdateStatus: (id: string, status: WaiterCallStatus) => void;
  onCreateCall: (payload: {
    tableId: string;
    requestType: WaiterCallType;
    note?: string;
  }) => Promise<boolean> | void;
}> = ({ calls, tables, canOperate = true, onUpdateStatus, onCreateCall }) => {
  const [filter, setFilter] = useState<'active' | 'resolved'>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [tableId, setTableId] = useState(tables[0]?.id ?? '');
  const [requestType, setRequestType] = useState<WaiterCallType>('Table Assistance');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!tableId && tables[0]?.id) setTableId(tables[0].id);
  }, [tables, tableId]);

  const filtered = calls.filter((c) =>
    filter === 'active' ? c.status !== 'Resolved' : c.status === 'Resolved'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableId || creating) return;
    setCreating(true);
    try {
      const ok = await onCreateCall({ tableId, requestType, note: note.trim() });
      if (ok !== false) {
        setModalOpen(false);
        setNote('');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`rounded-xl px-4 py-2 text-xs font-medium transition ${
              filter === 'active'
                ? 'bg-[#111111] text-white'
                : 'border border-[#E5E7EB] bg-white text-neutral-500'
            }`}
          >
            Active Queue ({calls.filter((c) => c.status !== 'Resolved').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`rounded-xl px-4 py-2 text-xs font-medium transition ${
              filter === 'resolved'
                ? 'bg-[#111111] text-white'
                : 'border border-[#E5E7EB] bg-white text-neutral-500'
            }`}
          >
            Resolved ({calls.filter((c) => c.status === 'Resolved').length})
          </button>
        </div>

        {canOperate && (
          <button
            type="button"
            disabled={tables.length === 0}
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-[#16A34A]/40 bg-white px-4 py-2 text-xs font-semibold text-[#16A34A] hover:bg-[#16A34A]/15 disabled:opacity-45"
            title={tables.length === 0 ? 'Add at least one table first' : undefined}
          >
            <Plus className="h-3.5 w-3.5" /> Log Table Request
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#111111]">
            {filter === 'active' ? 'No active waiter calls' : 'No resolved waiter calls yet'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {filter === 'active'
              ? 'When seated guests press Call Waiter on their table QR menu, alerts appear here in real time.'
              : 'Resolved service requests will be archived in this view.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((call) => (
            <div
              key={call.id}
              className={`rounded-2xl border p-5 transition ${
                call.status === 'Incoming'
                  ? 'border-[#16A34A]/40 bg-white'
                  : 'border-[#E5E7EB] bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5F5F5] text-[#16A34A]">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-[#111111]">
                        Table {call.tableNumber}
                      </span>
                      <Badge
                        variant={
                          call.status === 'Incoming'
                            ? 'amber'
                            : call.status === 'Acknowledged'
                            ? 'gold'
                            : 'emerald'
                        }
                      >
                        {call.status}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-[#16A34A]">{call.requestType}</p>
                  </div>
                </div>
                <span className="text-xs text-neutral-500">{formatCallTime(call.createdAt)}</span>
              </div>

              {call.note && (
                <p className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-xs text-neutral-500">
                  {call.note}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] pt-3">
                <span className="text-xs text-neutral-500">
                  {call.assignedTo ? `Handled by: ${call.assignedTo}` : 'Awaiting server'}
                </span>
                {canOperate && (
                  <div className="flex gap-2">
                    {call.status === 'Incoming' && (
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(call.id, 'Acknowledged')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#16A34A]/40 bg-[#F5F5F5] px-3 py-1.5 text-xs font-medium text-[#16A34A] hover:bg-[#16A34A]/15"
                      >
                        <Check className="h-3.5 w-3.5" /> Acknowledge
                      </button>
                    )}
                    {call.status !== 'Resolved' && (
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(call.id, 'Resolved')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Resolve
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log Table Service Request"
        subtitle="Creates a live waiter call in Cloudflare D1"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Table</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.number} ({t.zone})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Request Type</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as WaiterCallType)}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
            >
              <option value="Table Assistance">Table Assistance</option>
              <option value="Water Refill">Water Refill</option>
              <option value="Cutlery & Napkins">Cutlery &amp; Napkins</option>
              <option value="Request Bill">Request Bill</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Split bill by two cards"
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-[#16A34A] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? 'Sending...' : 'Log Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
