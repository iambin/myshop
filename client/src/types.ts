export interface Product {
  id: number;
  name: string;
  description: string;
  specs: string;
  price: number;
  image_url: string | null;
  stock: number;
  category_id: number;
  category_name: string;
  created_at: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Category {
  id: number;
  name: string;
  product_count?: number;
}

export interface ProductInput {
  name: string;
  description: string;
  specs: string;
  price: number;
  image_url: string | null;
  stock: number;
  category_id: number;
}

export interface VisitStats {
  online: number;
  today: number;
  week: number;
  month: number;
  total: number;
}
