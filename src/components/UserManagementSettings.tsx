import React, { useState } from 'react';
import { 
  Users, 
  ShieldCheck, 
  User as UserIcon, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  RotateCcw, 
  X, 
  Lock, 
  Check, 
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StoreUser, UserRole, DEFAULT_STORE_USERS } from '../types';
import { toast } from 'react-toastify';
import { cn } from '../lib/utils';

export default function UserManagementSettings() {
  const { storeUsers, updateStoreUsers, activeRole, activeUser, switchActiveRole } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('User');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpenAdd = () => {
    setEditingUserId(null);
    setName('');
    setEmail('');
    setRole('User');
    setPhone('');
    setStatus('Active');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: StoreUser) => {
    setEditingUserId(user.id);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setPhone(user.phone || '');
    setStatus(user.status);
    setNotes(user.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Please enter the user name');
      return;
    }
    if (!email.trim()) {
      toast.warning('Please enter an email address');
      return;
    }

    setSaving(true);
    try {
      if (editingUserId) {
        // Edit existing
        const updated = storeUsers.map(u => {
          if (u.id === editingUserId) {
            return {
              ...u,
              name: name.trim(),
              email: email.trim(),
              role,
              phone: phone.trim(),
              status,
              notes: notes.trim(),
            };
          }
          return u;
        });

        // Ensure at least one admin remains
        const hasAdmin = updated.some(u => u.role === 'Admin');
        if (!hasAdmin) {
          toast.error('At least one user must have the Admin role');
          setSaving(false);
          return;
        }

        await updateStoreUsers(updated);
        toast.success(`User "${name}" updated successfully`);
      } else {
        // Add new
        const newUser: StoreUser = {
          id: `user-${Date.now()}`,
          name: name.trim(),
          email: email.trim(),
          role,
          phone: phone.trim(),
          status,
          notes: notes.trim(),
          createdAt: new Date().toISOString()
        };
        const updated = [...storeUsers, newUser];
        await updateStoreUsers(updated);
        toast.success(`New ${role} user "${name}" added successfully`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving user:', err);
      toast.error('Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user: StoreUser) => {
    if (storeUsers.length <= 1) {
      toast.warning('You must keep at least one user');
      return;
    }

    if (user.role === 'Admin') {
      const remainingAdmins = storeUsers.filter(u => u.id !== user.id && u.role === 'Admin');
      if (remainingAdmins.length === 0) {
        toast.error('Cannot delete the only Admin. At least one Admin is required');
        return;
      }
    }

    if (!window.confirm(`Are you sure you want to delete user "${user.name}" (${user.role})?`)) {
      return;
    }

    try {
      const updated = storeUsers.filter(u => u.id !== user.id);
      await updateStoreUsers(updated);
      toast.success(`User "${user.name}" removed`);

      // If active user was deleted, switch to the remaining admin
      if (activeUser?.id === user.id) {
        const remainingAdmin = updated.find(u => u.role === 'Admin') || updated[0];
        if (remainingAdmin) {
          switchActiveRole(remainingAdmin.role, remainingAdmin);
        }
      }
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  const handleResetToDefaults = async () => {
    if (!window.confirm('Reset users back to default 02 Users: 1. Admin (Full access) and 2. User (Restricted access)?')) {
      return;
    }

    try {
      await updateStoreUsers(DEFAULT_STORE_USERS);
      toast.success('Reset to standard 02 Users: 1. Admin and 2. User');
    } catch (err) {
      toast.error('Failed to reset users');
    }
  };

  const handleSwitchUser = (user: StoreUser) => {
    switchActiveRole(user.role, user);
    if (user.role === 'User') {
      toast.info(`Switched to User role: Dashboard restricted (Total Sales, Total Stock Price, and Sales & Profit Overview are hidden). Only Dashboard, Sales, Products, and Customers are accessible.`);
    } else {
      toast.success(`Switched to Admin role: Full access restored to all modules, financials, inventory, and settings.`);
    }
  };

  return (
    <div className="glass-panel shadow-sm rounded-2xl p-6 sm:p-8 bg-white border border-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#0a382c] border border-emerald-150 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">User Management & Access Roles</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                {storeUsers.length} Users
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage system users and access permissions (Admin with Full Access vs. User with Restricted Access)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
            title="Reset to initial 02 users (Admin & User)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset 02 Users</span>
          </button>
          
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0a382c] hover:bg-[#0c4436] rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Role Permissions Comparison Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Admin Role Card */}
        <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-sm font-extrabold text-emerald-950">1. Admin</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200">
              Full Application Access
            </span>
          </div>
          <p className="text-xs text-emerald-900/80 font-medium mb-3">
            Can view and manage everything in the application without restrictions.
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 text-emerald-900">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span><strong>Dashboard:</strong> All metrics, Total Sales, Stock Cost & Retail, Profit Overview chart</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-900">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span><strong>Modules:</strong> Sales, Products, Customers, Vendors, Inventory, Serials, Settings</span>
            </div>
          </div>
        </div>

        {/* User Role Card */}
        <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <UserIcon className="w-4 h-4" />
              </div>
              <span className="text-sm font-extrabold text-blue-950">2. User</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-blue-100 text-blue-900 border border-blue-200">
              Strictly Restricted
            </span>
          </div>
          <p className="text-xs text-blue-900/80 font-medium mb-3">
            Can view only 4 modules. Sensitive financial data is automatically hidden.
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 text-blue-900">
              <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span><strong>Allowed Modules:</strong> 1. Dashboard, 2. Sales, 3. Products, 4. Customers</span>
            </div>
            <div className="flex items-center gap-2 text-rose-800">
              <EyeOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span><strong>Dashboard Hides:</strong> Total Sales, Total Price of stock, Sales & Profit Overview</span>
            </div>
            <div className="flex items-center gap-2 text-rose-800">
              <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span><strong>Blocked:</strong> Vendors, Inventory, Serial Numbers, Settings, Purchases</span>
            </div>
          </div>
        </div>
      </div>

      {/* Users List Cards / Table */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Configured Users ({storeUsers.length})
        </h3>
        
        <div className="grid grid-cols-1 gap-3">
          {storeUsers.map((user) => {
            const isCurrentActive = (activeUser?.id === user.id) || (activeRole === user.role && !activeUser);
            const isAdminRole = user.role === 'Admin';

            return (
              <div 
                key={user.id} 
                className={cn(
                  "p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                  isCurrentActive 
                    ? "bg-slate-50/90 border-emerald-500/40 ring-1 ring-emerald-500/20 shadow-xs" 
                    : "bg-white border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-white text-sm shadow-xs shrink-0",
                    isAdminRole ? "bg-[#0a382c]" : "bg-blue-600"
                  )}>
                    {isAdminRole ? (
                      <ShieldCheck className="w-6 h-6 text-white" />
                    ) : (
                      <UserIcon className="w-6 h-6 text-white" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 truncate">{user.name}</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                        isAdminRole 
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                          : "bg-blue-100 text-blue-800 border border-blue-200"
                      )}>
                        {user.role}
                      </span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded text-[10px] font-bold",
                        user.status === 'Active' ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {user.status}
                      </span>
                      {isCurrentActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-2xs">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active View</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="font-mono text-slate-600">{user.email}</span>
                      {user.phone && <span>• {user.phone}</span>}
                    </div>

                    <p className="text-[11px] text-slate-500 mt-1">
                      {isAdminRole 
                        ? 'Full Access: All modules, financials, inventory, settings' 
                        : 'Restricted Access: Dashboard (hidden metrics), Sales, Products, Customers only'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {!isCurrentActive ? (
                    <button
                      type="button"
                      onClick={() => handleSwitchUser(user)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                        isAdminRole
                          ? "bg-emerald-50 text-emerald-800 hover:bg-[#0a382c] hover:text-white border border-emerald-200"
                          : "bg-blue-50 text-blue-800 hover:bg-blue-700 hover:text-white border border-blue-200"
                      )}
                      title={`Switch to this user session to test ${user.role} view`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Switch to {user.name}</span>
                    </button>
                  ) : (
                    <div className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Currently Active</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(user)}
                    className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Edit user details"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteUser(user)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0a382c]" />
                <span>{editingUserId ? 'Edit User' : 'Add New User'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  User Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Admin or User"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. admin@electromanage.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  System Role <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setRole('Admin')}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                      role === 'Admin'
                        ? "bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500 text-emerald-950"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold">1. Admin</span>
                      {role === 'Admin' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-[10px] text-slate-500">Full Access to everything</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('User')}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                      role === 'User'
                        ? "bg-blue-50/70 border-blue-500 ring-1 ring-blue-500 text-blue-950"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold">2. User</span>
                      {role === 'User' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <span className="text-[10px] text-slate-500">Dashboard, Sales, Products, Customers only</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+92 300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e: any) => setStatus(e.target.value)}
                    className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Role Description / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or job responsibilities..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="glass-input block w-full rounded-xl py-2 px-3 text-xs font-semibold text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0a382c] hover:bg-[#0d4a3b] rounded-xl shadow-xs transition-all disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingUserId ? 'Update User' : 'Save User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
