import React, { useState } from 'react';
import { BellRing, Check, CheckCheck, Plus } from 'lucide-react';
import { WaiterCall, WaiterCallStatus, WaiterCallType } from '../types';
import { Badge } from '../components/ui/Primitives';

export const WaiterCallsModule: React.FC<{
  calls: WaiterCall[];
  onUpdateStatus: (id: string, status: WaiterCallStatus) => void;
  onSimulateCall: (type: WaiterCallType) => void;
}> = ({ calls, onUpdateStatus, onSimulateCall }) => {
  const [filter, setFilter] = useState<'active' | 'resolved'>('active');

  const filtered = calls.filter((c) =>
    filter === 'active' ? c.status !== 'Resolved' : c.status === 'Resolved'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`rounded-xl px-4 py-2 text-xs font-medium transition ${
              filter === 'active'
                ? 'bg-[#D7A65A] text-[#101B17]'
                : 'border border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/75'
            }`}
          >
            Active Queue ({calls.filter((c) => c.status !== 'Resolved').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`rounded-xl px-4 py-2 text-xs font-medium transition ${
              filter === 'resolved'
                ? 'bg-[#D7A65A] text-[#101B17]'
                : 'border border-[#2C3D34] bg-[#1D2922] text-[#F3EBDD]/75'
            }`}
          >
            Resolved ({calls.filter((c) => c.status === 'Resolved').length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSimulateCall('Table Assistance')}
          className="flex items-center gap-2 rounded-xl border border-[#D7A65A]/45 bg-[#1D2922] px-4 py-2 text-xs font-semibold text-[#D7A65A] hover:bg-[#D7A65A]/15"
        >
          <Plus className="h-3.5 w-3.5" /> Simulate Incoming Call
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((call) => (
          <div
            key={call.id}
            className={`rounded-2xl border p-5 transition ${
              call.status === 'Incoming'
                ? 'border-[#D7A65A]/60 bg-[#1D2922]'
                : 'border-[#2C3D34] bg-[#1D2922]/80'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#101B17] text-[#D7A65A]">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-lg font-bold text-[#F3EBDD]">
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
                  <p className="text-xs font-medium text-[#D7A65A]">{call.requestType}</p>
                </div>
              </div>
              <span className="text-xs text-[#F3EBDD]/55">{call.createdAt}</span>
            </div>

            {call.note && (
              <p className="mt-3 rounded-xl border border-[#2C3D34] bg-[#101B17]/80 px-3.5 py-2.5 text-xs text-[#F3EBDD]/80">
                {call.note}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#2C3D34] pt-3">
              <span className="text-xs text-[#F3EBDD]/60">
                {call.assignedTo ? `Assigned: ${call.assignedTo}` : 'Unassigned'}
              </span>
              <div className="flex gap-2">
                {call.status === 'Incoming' && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(call.id, 'Acknowledged')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#D7A65A]/45 bg-[#101B17] px-3 py-1.5 text-xs font-medium text-[#D7A65A] hover:bg-[#D7A65A]/15"
                  >
                    <Check className="h-3.5 w-3.5" /> Acknowledge
                  </button>
                )}
                {call.status !== 'Resolved' && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(call.id, 'Resolved')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#D7A65A] px-3 py-1.5 text-xs font-semibold text-[#101B17] hover:bg-[#e3b772]"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
