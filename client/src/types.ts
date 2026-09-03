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
  /** 1 = 上架, 0 = 下架 */
  is_active: number;
  sort_order: number;
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
  /** 公開列表：上架商品數；管理列表（all=1）：同名欄位為 active_product_count */
  product_count?: number;
  active_product_count?: number;
  is_active?: number;
  sort_order?: number;
}

export interface ProductInput {
  name: string;
  description: string;
  specs: string;
  price: number;
  image_url: string | null;
  stock: number;
  category_id: number;
  is_active: number;
  sort_order: number;
}

export interface CategoryInput {
  name: string;
  is_active: number;
  sort_order: number;
}

export interface VisitStats {
  online: number;
  today: number;
  week: number;
  month: number;
  total: number;
}
