export type UserRole = 'Admin' | 'User';

export interface AuthorizedStoreEmail {
  email: string;
  packageExpiryDate: string; // ISO format "YYYY-MM-DD" or "Lifetime"
  packageName?: string;      // e.g. "Annual Plan", "Monthly Plan", "Trial", "Enterprise", "Lifetime"
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  notes?: string;
}

export interface StoreUser {
  id: string;
  name: string;
  username: string;
  password?: string;
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
    name: 'Super Admin',
    username: 'admin',
    password: 'admin123',
    email: 'aqeelaeo@gmail.com',
    role: 'Admin',
    status: 'Active',
    phone: '+92 300 0000000',
    notes: 'Super Admin (aqeelaeo@gmail.com) - Full administrator access and sole authority to authorize new stores',
    createdAt: new Date().toISOString()
  },
  {
    id: 'user-staff',
    name: 'User',
    username: 'user',
    password: 'user123',
    email: 'user@electromanage.com',
    role: 'User',
    status: 'Active',
    phone: '+92 301 1111111',
    notes: 'Restricted cashier access: Dashboard (restricted metrics), Sales, Products, and Customers only',
    createdAt: new Date().toISOString()
  }
];
