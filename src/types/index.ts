export type ModuleId =
  | 'overview'
  | 'menu'
  | 'categories'
  | 'images'
  | 'homepage'
  | 'gallery'
  | 'orders'
  | 'tables'
  | 'waiter-calls'
  | 'promotions'
  | 'reports'
  | 'staff'
  | 'settings';

export type AdminDbRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export interface AuthenticatedAdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminDbRole;
  uiRole: StaffRole;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryType?: 'food' | 'beverage';
  sortOrder: number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  description: string;
  imageUrl: string;
  imageKey?: string | null;
  available: boolean;
  featured: boolean;
  prepMinutes: number;
  dietaryTags: string[];
  options?: Record<string, unknown>;
  ordersCount: number;
}

export interface MediaAsset {
  id: string;
  title: string;
  url: string;
  r2Key: string;
  folder: 'dishes' | 'ambiance' | 'banners' | 'gallery' | 'branding';
  dimensions: string;
  sizeKb: number;
  uploadedAt: string;
}

export interface HomepageSection {
  id: string;
  label: string;
  description: string;
  visible: boolean;
  order: number;
}

export interface HomepageConfig {
  heroImageKey?: string;
  heroImageUrl: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaText: string;
  promoBannerEnabled: boolean;
  promoBannerText: string;
  promoBannerCode: string;
  sections: HomepageSection[];
}

export interface GalleryPhoto {
  id: string;
  title: string;
  caption: string;
  category: 'Dining Room' | 'Culinary' | 'Private Events' | 'Bar & Lounge';
  imageKey?: string | null;
  imageUrl: string;
  sortOrder: number;
  featured: boolean;
}

export type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Served' | 'Cancelled';

export interface OrderLineItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  variantLabel?: string;
  customisations?: Array<{
    groupName: string;
    optionName: string;
    price: number;
  }>;
  selectedSides?: string[];
  specialInstructions?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  tableId?: string;
  tableNumber: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  orderType: 'Dine-In' | 'Takeaway' | 'Delivery';
  items: OrderLineItem[];
  subtotal: number;
  discount?: number;
  tax: number;
  serviceCharge?: number;
  deliveryFee?: number;
  promoCode?: string;
  total: number;
  status: OrderStatus;
  notes?: string;
  staffNote?: string;
  createdAt: string;
}

export type TableStatus = 'Available' | 'Occupied' | 'Reserved' | 'Cleaning';

export interface RestaurantTable {
  id: string;
  number: string;
  zone: 'Main Dining' | 'Terrace' | 'Private Lounge' | 'Chef Counter';
  capacity: number;
  status: TableStatus;
  qrPath: string;
  qrUrl?: string;
  activeOrderNumber?: string;
}

export type WaiterCallType = 'Request Bill' | 'Water Refill' | 'Table Assistance' | 'Cutlery & Napkins';
export type WaiterCallStatus = 'Incoming' | 'Acknowledged' | 'Resolved';

export interface WaiterCall {
  id: string;
  tableId?: string;
  tableNumber: string;
  zone?: string;
  requestType: WaiterCallType;
  note?: string;
  status: WaiterCallStatus;
  createdAt: string;
  assignedTo?: string;
}

export interface Promotion {
  id: string;
  title: string;
  code: string;
  hasPromoCode?: boolean;
  discountText?: string;
  discountType: 'Percentage' | 'Fixed Amount' | 'Complimentary Item';
  discountValue: number;
  minOrder: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  usageCount: number;
  description: string;
}

export type StaffRole = 'Owner' | 'Manager' | 'Head Chef' | 'Server' | 'Host';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  dbRole?: AdminDbRole;
  status: 'On Shift' | 'Active' | 'Off Duty';
  membershipStatus?: string;
  shift: string;
  joinedAt: string;
}

export interface RestaurantSettings {
  restaurantName: string;
  tagline: string;
  cuisineType: string;
  currency: string;
  taxRatePercent: number;
  serviceChargePercent: number;
  deliveryFee: number;
  minOrderAmount: number;
  phone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  openingHours: string;
  websiteUrl: string;
  onlineOrderingEnabled: boolean;
  qrTableOrderingEnabled: boolean;
  autoAcceptOrders: boolean;
  waiterCallSoundEnabled: boolean;
  logoKey?: string;
  logoUrl?: string;
}

export interface ActivityEvent {
  id: string;
  title: string;
  detail: string;
  time: string;
  createdAt?: string;
  type: 'order' | 'waiter' | 'menu' | 'staff';
}

export interface ToastMessage {
  id: string;
  message: string;
  tone: 'success' | 'info' | 'warning';
}
