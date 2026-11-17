import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { StaffMember, StaffRole } from '../types';
import { Badge, ConfirmDialog, Modal } from '../components/ui/Primitives';

export const StaffModule: React.FC<{
  staff: StaffMember[];
  currentUserEmail?: string;
  canManageStaff?: boolean;
  onSaveStaff: (member: StaffMember, isNew: boolean) => Promise<boolean> | void;
  onDeleteStaff: (id: string) => void;
}> = ({ staff, currentUserEmail = '', canManageStaff = true, onSaveStaff, onDeleteStaff }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || saving) return;
    setSaving(true);
    try {
      const ok = await onSaveStaff(
        {
          id: editing ? editing.id : `stf-${Date.now()}`,
          joinedAt: editing ? editing.joinedAt : new Date().toISOString().slice(0, 10),
          ...form,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          shift: form.shift.trim(),
        },
        !editing
      );
      if (ok !== false) setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Manage staff invitations, shift schedules, and role-based dashboard permissions. Share the Admin sign-in page with invitees; they must register with the listed email and confirm it before access is granted.
        </p>
        {canManageStaff && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Invite Staff Member
          </button>
        )}
      </div>

      {!canManageStaff && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs text-neutral-500">
          Only Owner and Admin accounts can add, modify, or revoke staff access.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E5E7EB] bg-[#F5F5F5] text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3.5">Team Member</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Shift</th>
                <th className="px-5 py-3.5">Status</th>
                {canManageStaff && <th className="px-5 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {staff.map((m) => {
                const isSelf = m.email.toLowerCase() === currentUserEmail.toLowerCase();
                return (
                  <tr key={m.id} className="transition hover:bg-[#F5F5F5]">
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#111111]">
                        {m.name} {isSelf && <span className="text-xs text-[#16A34A]">(You)</span>}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {m.email}
                        {m.phone ? ` • ${m.phone}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="gold">
                        <ShieldCheck className="h-3 w-3" /> {m.role}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-xs text-neutral-500">{m.shift}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
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
                        {m.membershipStatus === 'invited' && (
                          <Badge variant="gold">Invite Pending</Badge>
                        )}
                      </div>
                    </td>
                    {canManageStaff && (
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] p-2 text-neutral-500 hover:text-[#16A34A]"
                            aria-label={`Edit ${m.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => setDeleteTarget(m)}
                            className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F5] p-2 text-rose-600 hover:text-rose-600 disabled:opacity-30"
                            title={isSelf ? 'You cannot revoke your own membership' : `Remove ${m.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Staff Member' : 'Invite Staff Member'}
        subtitle="Authorizes the team member's email in D1 memberships for Cloudflare Access login"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Full Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Email</label>
              <input
                type="email"
                required
                disabled={Boolean(editing)}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              >
                <option value="Owner">Owner</option>
                <option value="Manager">Manager</option>
                <option value="Head Chef">Head Chef</option>
                <option value="Server">Server</option>
                <option value="Host">Host</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Duty Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as StaffMember['status'] })
                }
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F5] px-3.5 py-2.5 text-sm text-[#111111]"
              >
                <option value="On Shift">On Shift</option>
                <option value="Active">Active</option>
                <option value="Off Duty">Off Duty</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Shift Schedule</label>
            <input
              type="text"
              value={form.shift}
              onChange={(e) => setForm({ ...form, shift: e.target.value })}
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
              disabled={saving}
              className="rounded-xl bg-[#16A34A] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Member'}
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
