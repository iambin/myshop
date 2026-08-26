import type { Category, Product, ProductListResponse, VisitStats } from "../types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface ProductQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  sort?: string;
  /** true → 管理模式（含下架商品，需登入） */
  all?: boolean;
}

export function fetchProducts(query: ProductQuery): Promise<ProductListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.sort && query.sort !== "default") params.set("sort", query.sort);
  if (query.all) params.set("all", "1");
  return get<ProductListResponse>(`/api/products?${params}`);
}

export async function fetchProduct(id: number | string): Promise<Product> {
  const res = await fetch(`/api/products/${id}`);
  if (res.status === 404) throw new Error("商品不存在或已下架");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<Product>;
}

export function fetchCategories(): Promise<Category[]> {
  return get<Category[]>("/api/categories");
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

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function createProduct(input: ProductInput): Promise<{ id: number }> {
  return send("POST", "/api/products", input);
}

export function updateProduct(id: number | string, input: ProductInput): Promise<{ ok: boolean }> {
  return send("PUT", `/api/products/${id}`, input);
}

export function deleteProduct(id: number): Promise<{ ok: boolean }> {
  return send("DELETE", `/api/products/${id}`);
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const body = new FormData();
  body.append("image", file);
  // send() forces JSON headers, so upload uses its own fetch
  const res = await fetch("/api/uploads", { method: "POST", body });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

export async function checkAdminAuth(): Promise<boolean> {
  const res = await fetch("/api/products?page=1&pageSize=1", { method: "POST" });
  // 401 = not logged in; 400 (validation error) = logged in
  return res.status !== 401;
}

export interface CategoryWithCount extends Category {
  product_count: number;
  active_product_count: number;
  is_active: number;
  sort_order: number;
}

/** 管理列表：含手動下架與自動下架（無上架商品）的分類，需登入 */
export function fetchCategoriesWithCount(): Promise<CategoryWithCount[]> {
  return get<CategoryWithCount[]>("/api/categories?all=1");
}

export interface CategoryInput {
  name: string;
  is_active: number;
  sort_order: number;
}

export function createCategory(input: CategoryInput): Promise<{ id: number }> {
  return send("POST", "/api/categories", input);
}

export function updateCategory(id: number, input: CategoryInput): Promise<{ ok: boolean }> {
  return send("PUT", `/api/categories/${id}`, input);
}

export function deleteCategory(id: number): Promise<{ ok: boolean }> {
  return send("DELETE", `/api/categories/${id}`);
}

const VISITOR_ID_KEY = "shop_visitor_id";

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

export function sendHeartbeat(): Promise<{ ok: boolean }> {
  return send("POST", "/api/stats/heartbeat", { visitorId: getVisitorId() });
}

export function fetchVisitStats(): Promise<VisitStats> {
  return get<VisitStats>("/api/stats/visits");
}
