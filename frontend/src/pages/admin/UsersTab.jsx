import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Save, Trash2, Ban, UserCog, X, ShieldCheck } from "lucide-react";
import BulkActionsBar, { BulkActionButton, BulkCheckbox } from "@/components/admin/BulkActionsBar";
import useBulkSelection from "@/components/admin/useBulkSelection";

/* UsersTab — admin CRUD over the users collection.
 *
 * Features:
 *   • Search by name / email / phone (debounced)
 *   • Filter by role
 *   • Inline row → click to edit in a dialog
 *   • Edit: name, email, role, wallet_balance, banned
 *   • Delete (confirm)
 *
 * Backend contract lives in /app/backend/admin_crud.py:
 *   GET    /api/admin/users?q&role&limit&skip
 *   PATCH  /api/admin/users/{id}   body: UserPatch
 *   DELETE /api/admin/users/{id}
 */
const ROLES = [
  { value: "any",        label: "All roles" },
  { value: "customer",   label: "Customer" },
  { value: "provider",   label: "Provider" },
  { value: "retailer",   label: "Retailer" },
  { value: "restaurant", label: "Restaurant" },
  { value: "admin",      label: "Admin" },
];

export default function UsersTab() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [role, setRole] = useState("any");
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (debouncedQ) params.set("q", debouncedQ);
    if (role !== "any") params.set("role", role);
    // GET /admin/users is served by admin_data.py — returns { items, total }
    api.get(`/admin/users?${params.toString()}`)
      .then(({ data }) => { setUsers(data.items || data.users || []); setTotal(data.total || 0); })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [debouncedQ, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const del = async (u) => {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success("User deleted");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sel = useBulkSelection(users);

  const bulkDelete = async () => {
    if (!sel.count) return;
    if (!window.confirm(`Delete ${sel.count} user${sel.count === 1 ? "" : "s"}? This cannot be undone.`)) return;
    try {
      const { data } = await api.post("/admin/users/bulk-delete", { ids: sel.selectedIds });
      toast.success(`Deleted ${data.deleted_count} user${data.deleted_count === 1 ? "" : "s"}${data.skipped_self ? " (your own account was skipped)" : ""}`);
      sel.clear();
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const bulkBan = async (banned) => {
    if (!sel.count) return;
    try {
      const { data } = await api.post("/admin/users/bulk-patch", {
        ids: sel.selectedIds,
        updates: { banned },
      });
      toast.success(`${banned ? "Banned" : "Unbanned"} ${data.modified_count} user${data.modified_count === 1 ? "" : "s"}`);
      sel.clear();
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-4" data-testid="admin-users-tab">
      <div className="flex items-center gap-2">
        <UserCog className="w-4 h-4 text-teal-700" />
        <h3 className="font-display text-xl font-black tracking-tighter flex-1">Users <span className="text-slate-400 font-mono text-sm ml-2">{total} total</span></h3>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or phone…"
            className="pl-9"
            data-testid="admin-users-search"
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-[180px]" data-testid="admin-users-role-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-slate-200 divide-y divide-slate-100">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-[10px] font-mono uppercase tracking-widest text-slate-500 items-center">
          <div className="col-span-1 flex items-center">
            <BulkCheckbox
              checked={sel.allSelected}
              indeterminate={sel.someSelected}
              onChange={sel.toggleAll}
              ariaLabel="Select all users on this page"
              testId="admin-users-select-all"
            />
          </div>
          <div className="col-span-3">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Wallet</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {loading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
        {!loading && users.length === 0 && <div className="p-6 text-sm text-slate-500" data-testid="admin-users-empty">No users match.</div>}
        {!loading && users.map((u) => (
          <div key={u.id} className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 text-sm hover:bg-slate-50 ${sel.isSelected(u.id) ? "bg-slate-50" : ""}`} data-testid={`admin-user-row-${u.id}`}>
            <div className="col-span-1 flex items-center">
              <BulkCheckbox
                checked={sel.isSelected(u.id)}
                onChange={() => sel.toggle(u.id)}
                ariaLabel={`Select ${u.email}`}
                testId={`admin-user-select-${u.id}`}
              />
            </div>
            <div className="col-span-11 sm:col-span-3">
              <div className="font-display font-bold text-slate-900 flex items-center gap-2">
                {u.name || "—"}
                {u.banned && <span className="text-[9px] font-mono uppercase tracking-widest bg-red-100 text-red-700 px-1.5 py-0.5">Banned</span>}
              </div>
              <div className="text-xs text-slate-500 font-mono">{u.email}</div>
            </div>
            <div className="col-span-6 sm:col-span-2 text-xs font-mono uppercase tracking-widest text-slate-700">{u.role}</div>
            <div className="col-span-6 sm:col-span-2 text-right font-mono">${Number(u.wallet_balance || 0).toFixed(2)}</div>
            <div className="col-span-6 sm:col-span-2 text-xs text-slate-500 font-mono">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</div>
            <div className="col-span-6 sm:col-span-2 text-right flex justify-end gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditing(u)} data-testid={`admin-user-edit-${u.id}`}>Edit</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-800 hover:bg-red-50" onClick={() => del(u)} data-testid={`admin-user-del-${u.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <BulkActionsBar count={sel.count} onClear={sel.clear} testId="admin-users-bulk-bar">
        <BulkActionButton onClick={() => bulkBan(true)} variant="warning" testId="admin-users-bulk-ban">
          <Ban className="w-3.5 h-3.5" /> Ban
        </BulkActionButton>
        <BulkActionButton onClick={() => bulkBan(false)} variant="success" testId="admin-users-bulk-unban">
          <ShieldCheck className="w-3.5 h-3.5" /> Unban
        </BulkActionButton>
        <BulkActionButton onClick={bulkDelete} variant="danger" testId="admin-users-bulk-delete">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </BulkActionButton>
      </BulkActionsBar>

      {editing && <UserEditDialog user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function UserEditDialog({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user.name || "",
    email: user.email || "",
    role: user.role || "customer",
    wallet_balance: String(user.wallet_balance ?? "0"),
    banned: !!user.banned,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        name: form.name || null,
        email: form.email || null,
        role: form.role || null,
        wallet_balance: form.wallet_balance === "" ? null : parseFloat(form.wallet_balance),
        banned: form.banned,
      };
      await api.patch(`/admin/users/${user.id}`, patch);
      toast.success("User updated");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="admin-user-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Change the user&apos;s profile, role or wallet. Ban blocks login instantly.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="overline text-[10px]">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="admin-user-edit-name" />
          </div>
          <div>
            <Label className="overline text-[10px]">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="admin-user-edit-email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="overline text-[10px]">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="admin-user-edit-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r.value !== "any").map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="overline text-[10px]">Wallet balance ($)</Label>
              <Input type="number" step="0.01" value={form.wallet_balance} onChange={(e) => setForm({ ...form, wallet_balance: e.target.value })} data-testid="admin-user-edit-wallet" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.banned} onChange={(e) => setForm({ ...form, banned: e.target.checked })} data-testid="admin-user-edit-banned" />
            <Ban className="w-3.5 h-3.5 text-red-600" /> Ban this user (blocks login)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-user-edit-save">
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
