export type UserRole = 'Admin' | 'User';

export interface StoreUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  phone?: string;
  notes?: string;
  createdAt: string;
  lastActive?: string;
}

export const DEFAULT_STORE_USERS: StoreUser[] = [
  {
    id: 'user-admin',
    name: 'Admin',
    email: 'admin@electromanage.com',
    role: 'Admin',
    status: 'Active',
    phone: '+92 300 0000000',
    notes: 'Full administrator access to all modules, financial data, inventory, and settings',
    createdAt: new Date().toISOString()
  },
  {
    id: 'user-staff',
    name: 'User',
    email: 'user@electromanage.com',
    role: 'User',
    status: 'Active',
    phone: '+92 301 1111111',
    notes: 'Restricted cashier access: Dashboard (restricted metrics), Sales, Products, and Customers only',
    createdAt: new Date().toISOString()
  }
];
