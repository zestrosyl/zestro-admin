import React, { useState } from 'react';
import { QrCode, Plus, Pencil, Trash2, Users, Copy, Download } from 'lucide-react';
import { RestaurantTable, TableStatus } from '../types';
import { Badge, ConfirmDialog, Modal, QrCodeSvg } from '../components/ui/Primitives';

export const TablesModule: React.FC<{
  tables: RestaurantTable[];
  publicMenuBaseUrl: string;
  onSaveTable: (table: RestaurantTable, isNew: boolean) => void;
  onDeleteTable: (id: string) => void;
  onNotify: (msg: string) => void;
}> = ({ tables, publicMenuBaseUrl, onSaveTable, onDeleteTable, onNotify }) => {
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState<{
    number: string;
    zone: RestaurantTable['zone'];
    capacity: number;
    status: TableStatus;
  }>({
    number: '',
    zone: 'Main Dining',
    capacity: 4,
    status: 'Available',
  });

  const buildMenuUrl = (tableNumber: string) => {
    const base = publicMenuBaseUrl.trim().replace(/\/+$/, '');
    return base ? `${base}/menu?table=${encodeURIComponent(tableNumber)}` : '';
  };

  const statusVariant = (s: TableStatus) => {
    if (s === 'Available') return 'emerald';
    if (s === 'Occupied') return 'gold';
    if (s === 'Reserved') return 'amber';
    return 'neutral';
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      number: `T-${String(tables.length + 1).padStart(2, '0')}`,
      zone: 'Main Dining',
      capacity: 4,
      status: 'Available',
    });
    setEditModal(true);
  };

  const openEdit = (tbl: RestaurantTable) => {
    setEditing(tbl);
    setForm({
      number: tbl.number,
      zone: tbl.zone,
      capacity: tbl.capacity,
      status: tbl.status,
    });
    setEditModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.number.trim()) return;
    const num = form.number.trim().toUpperCase();
    onSaveTable(
      {
        id: editing ? editing.id : `tbl-${Date.now()}`,
        number: num,
        zone: form.zone,
        capacity: form.capacity,
        status: form.status,
        qrPath: buildMenuUrl(num),
        activeOrderNumber: editing?.activeOrderNumber,
      },
      !editing
    );
    setEditModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Manage dining zones, table availability, and scannable menu QR codes.
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" /> Add Table
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tables.map((tbl) => (
          <div
            key={tbl.id}
            className="rounded-2xl border border-[#2C3D34] bg-[#1D2922] p-5 transition hover:border-[#D7A65A]/45"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#D7A65A]">
                  {tbl.zone}
                </p>
                <h3 className="mt-0.5 font-serif text-2xl font-bold text-[#F3EBDD]">{tbl.number}</h3>
              </div>
              <Badge variant={statusVariant(tbl.status)}>{tbl.status}</Badge>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-[#F3EBDD]/70">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[#D7A65A]" /> {tbl.capacity} Seats
              </span>
              {tbl.activeOrderNumber && (
                <span className="font-mono text-[#D7A65A]">{tbl.activeOrderNumber}</span>
              )}
            </div>

            <div className="mt-4">
              <select
                value={tbl.status}
                onChange={(e) =>
                  onSaveTable({ ...tbl, status: e.target.value as TableStatus }, false)
                }
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2 text-xs text-[#F3EBDD]"
              >
                <option value="Available">Available</option>
                <option value="Occupied">Occupied</option>
                <option value="Reserved">Reserved</option>
                <option value="Cleaning">Cleaning</option>
              </select>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#2C3D34] pt-3">
              <button
                type="button"
                onClick={() => setQrTable({ ...tbl, qrPath: buildMenuUrl(tbl.number) })}
                className="flex items-center gap-1.5 text-xs font-medium text-[#D7A65A] hover:underline"
              >
                <QrCode className="h-3.5 w-3.5" /> View QR
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => openEdit(tbl)}
                  className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-[#F3EBDD]/80 hover:text-[#D7A65A]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(tbl)}
                  className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-1.5 text-rose-300/80 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(qrTable)}
        onClose={() => setQrTable(null)}
        title={`Table ${qrTable?.number ?? ''} QR Code`}
        subtitle={qrTable?.zone}
        maxWidth="max-w-sm"
      >
        {qrTable && (
          <div className="flex flex-col items-center space-y-4 text-center">
            {qrTable.qrPath ? (
              <>
                <div id="zestro-table-qr"><QrCodeSvg value={qrTable.qrPath} size={180} /></div>
                <p className="max-w-full break-all font-mono text-xs text-[#D7A65A]">{qrTable.qrPath}</p>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                Add your customer website URL in Settings before generating table QR codes. This prevents printing links that point to a placeholder domain.
              </div>
            )}
            {qrTable.qrPath && <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(qrTable.qrPath).catch(() => {});
                  onNotify(`Copied QR link for ${qrTable.number}`);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2C3D34] bg-[#101B17] px-3 py-2.5 text-xs font-semibold text-[#F3EBDD]"
              >
                <Copy className="h-3.5 w-3.5" /> Copy Link
              </button>
              <button
                type="button"
                onClick={() => {
                  const svg = document.querySelector('#zestro-table-qr svg');
                  if (!svg) return;
                  const source = new XMLSerializer().serializeToString(svg);
                  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `zestro-${qrTable.number.toLowerCase()}-qr.svg`;
                  link.click();
                  URL.revokeObjectURL(url);
                  onNotify(`Downloaded QR code for ${qrTable.number}`);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#D7A65A] px-3 py-2.5 text-xs font-semibold text-[#101B17]"
              >
                <Download className="h-3.5 w-3.5" /> Download SVG
              </button>
            </div>}
          </div>
        )}
      </Modal>

      <Modal
        open={editModal}
        onClose={() => setEditModal(false)}
        title={editing ? 'Edit Table' : 'Add Table'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Table Number</label>
              <input
                type="text"
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Capacity</label>
              <input
                type="number"
                min={1}
                max={24}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Zone</label>
            <select
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value as RestaurantTable['zone'] })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            >
              <option value="Main Dining">Main Dining</option>
              <option value="Terrace">Terrace</option>
              <option value="Private Lounge">Private Lounge</option>
              <option value="Chef Counter">Chef Counter</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditModal(false)}
              className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17]"
            >
              Save Table
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Table"
        message={`Remove table ${deleteTarget?.number} and deactivate its QR code?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteTable(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
