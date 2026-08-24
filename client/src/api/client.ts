import type { Category, Product, ProductListResponse } from "../types";

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
}

export function fetchProducts(query: ProductQuery): Promise<ProductListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  return get<ProductListResponse>(`/api/products?${params}`);
}

export function fetchProduct(id: number | string): Promise<Product> {
  return get<Product>(`/api/products/${id}`);
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
}

export function fetchCategoriesWithCount(): Promise<CategoryWithCount[]> {
  return get<CategoryWithCount[]>("/api/categories");
}

export function createCategory(name: string): Promise<{ id: number }> {
  return send("POST", "/api/categories", { name });
}

export function updateCategory(id: number, name: string): Promise<{ ok: boolean }> {
  return send("PUT", `/api/categories/${id}`, { name });
}

export function deleteCategory(id: number): Promise<{ ok: boolean }> {
  return send("DELETE", `/api/categories/${id}`);
}
