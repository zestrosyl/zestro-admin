import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';

export const StaffModule: React.FC<{
  staff: StaffMember[];
  onSaveStaff: (member: StaffMember, isNew: boolean) => void;
  onDeleteStaff: (id: string) => void;
}> = ({ staff, onSaveStaff, onDeleteStaff }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<Omit<StaffMember, 'id' | 'joinedAt'>>({
    name: '',
    email: '',
    phone: '',
    role: 'Server',
    status: 'Active',
    shift: 'Evening (16:00 – 23:00)',
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '',
      email: '',
      phone: '',
      role: 'Server',
      status: 'Active',
      shift: 'Evening (16:00 – 23:00)',
    });
    setModalOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email,
      phone: m.phone,
      role: m.role,
      status: m.status,
      shift: m.shift,
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    onSaveStaff(
      {
        id: editing ? editing.id : `stf-${Date.now()}`,
        joinedAt: editing ? editing.joinedAt : new Date().toISOString().slice(0, 10),
        ...form,
      },
      !editing
    );
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#F3EBDD]/70">
          Manage team roles, shift schedules, and role-based dashboard access.
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-[#D7A65A] px-4 py-2.5 text-sm font-semibold text-[#101B17] hover:bg-[#e3b772]"
        >
          <Plus className="h-4 w-4" /> Invite Staff Member
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#2C3D34] bg-[#1D2922]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#2C3D34] bg-[#101B17]/70 text-xs uppercase tracking-wider text-[#F3EBDD]/60">
              <tr>
                <th className="px-5 py-3.5">Team Member</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Shift</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2C3D34]">
              {staff.map((m) => (
                <tr key={m.id} className="transition hover:bg-[#101B17]/40">
                  <td className="px-5 py-4">
                    <p className="font-medium text-[#F3EBDD]">{m.name}</p>
                    <p className="text-xs text-[#F3EBDD]/55">
                      {m.email} • {m.phone}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant="gold">
                      <ShieldCheck className="h-3 w-3" /> {m.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#F3EBDD]/75">{m.shift}</td>
                  <td className="px-5 py-4">
                    <Badge
                      variant={
                        m.status === 'On Shift'
                          ? 'emerald'
                          : m.status === 'Active'
                          ? 'amber'
                          : 'neutral'
                      }
                    >
                      {m.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-[#F3EBDD]/80 hover:text-[#D7A65A]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(m)}
                        className="rounded-lg border border-[#2C3D34] bg-[#101B17] p-2 text-rose-300/80 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Staff Member' : 'Invite Staff Member'}
        subtitle="Access credentials are sent via email invite (no passwords stored in client state)"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Full Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              >
                <option value="Owner">Owner</option>
                <option value="Manager">Manager</option>
                <option value="Head Chef">Head Chef</option>
                <option value="Server">Server</option>
                <option value="Host">Host</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as StaffMember['status'] })
                }
                className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
              >
                <option value="On Shift">On Shift</option>
                <option value="Active">Active</option>
                <option value="Off Duty">Off Duty</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#F3EBDD]/75">Shift Schedule</label>
            <input
              type="text"
              value={form.shift}
              onChange={(e) => setForm({ ...form, shift: e.target.value })}
              className="w-full rounded-xl border border-[#2C3D34] bg-[#101B17] px-3.5 py-2.5 text-sm text-[#F3EBDD]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-[#2C3D34] bg-[#101B17] px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#D7A65A] px-5 py-2 text-sm font-semibold text-[#101B17]"
            >
              Save Member
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Staff Account"
        message={`Revoke dashboard access for ${deleteTarget?.name}?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteStaff(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
