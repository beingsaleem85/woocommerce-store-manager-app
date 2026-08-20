/**
 * WooCommerce API types
 */

export interface WCProduct {
  id: number;
  name: string;
  permalink: string;
  sku: string;
  short_description: string;
  description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  manage_stock: boolean;
  type: string;
  external_url?: string;
  button_text?: string;
  downloadable?: boolean;
  downloads?: { id: string; name: string; file: string }[];
  images: { id: number; src: string; alt: string }[];
  categories: { id: number; name: string; slug: string }[];
  brands?: { id: number; name: string; slug: string }[];
  attributes?: {
    id: number;
    name: string;
    position: number;
    visible: boolean;
    variation: boolean;
    options: string[];
  }[];
}

export interface WCVariation {
  id: number;
  regular_price: string;
  sale_price: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  attributes: { id: number; name: string; option: string }[];
}
export interface WCCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

export interface WCBrand {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface WCAttribute {
  id: number;
  name: string;
  slug: string;
  type: string;
  order_by: string;
  has_archives: boolean;
}

export interface WCTerm {
  id: number;
  name: string;
  slug: string;
  description: string;
  menu_order: number;
  count: number;
}

export interface WCOrder {
  id: number;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  line_items: {
    id: number;
    name: string;
    quantity: number;
    total: string;
  }[];
}

export interface WCOrderStatus {
  slug: string;
  name: string;
  total: number;
}

export interface WCUser {
  user_id: number;
  username: string;
  display_name: string;
  email: string;
  roles: string[];
}

export interface LoginResponse {
  app_password: string;
  user: WCUser;
}
