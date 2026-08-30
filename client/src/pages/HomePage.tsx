import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchProducts } from "../api/client";
import type { Product } from "../types";
import { ProductCard } from "../components/ProductCard";
import { Pagination } from "../components/Pagination";
import { Logo } from "../components/Logo";
import { ProductDetailModal } from "../components/ProductDetailModal";

const PAGE_SIZE = 12;
const SORT_OPTIONS = [
  { value: "default", label: "預設排序" },
  { value: "newest", label: "最新上架" },
  { value: "price_asc", label: "價格：由低到高" },
  { value: "price_desc", label: "價格：由高到低" },
];

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Number(searchParams.get("page")) || 1;
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const sort = searchParams.get("sort") ?? "default";
  const selectedProductId = searchParams.get("product");
  const [searchInput, setSearchInput] = useState(q);
  const categoryListRef = useRef<HTMLUListElement>(null);
  const manyCategories = categories.length > 8;

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.map((c: { name: string }) => c.name)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!manyCategories) return;
    const list = categoryListRef.current;
    const active = list?.querySelector<HTMLButtonElement>("button.active");
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const left = list.scrollLeft + (activeRect.left - listRect.left) - list.clientWidth / 2 + activeRect.width / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [category, manyCategories]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchProducts({ page, pageSize: PAGE_SIZE, q, category, sort })
      .then((data) => {
        setProducts(data.items);
        setTotal(data.total);
        // e.g. items were deleted while browsing a now-out-of-range page
        if (data.items.length === 0 && data.total > 0 && page > 1) updateParams({ page: null });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, q, category, sort]);

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  }

  return (
    <div className="home">
      <header className="header">
        <Link to="/" className="logo-link">
          <Logo />
        </Link>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q: searchInput.trim(), page: null });
          }}
        >
          <input
            type="search"
            placeholder="搜尋商品、分類或規格…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit">搜尋</button>
        </form>
      </header>

      <div className="layout">
        <aside className={manyCategories ? "sidebar sidebar-many" : "sidebar"}>
          <h2>商品分類</h2>
          <ul ref={categoryListRef}>
            <li>
              <button className={!category ? "active" : ""} onClick={() => updateParams({ category: null, page: null })}>
                全部
              </button>            </li>
            {categories.map((name) => (
              <li key={name}>
                <button
                  className={category === name ? "active" : ""}
                  onClick={() => updateParams({ category: name, page: null })}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main>
          <div className="toolbar">
            <span>
              共 {total} 件商品
              {q && `，搜尋「${q}」`}
            </span>
            <select value={sort} onChange={(e) => updateParams({ sort: e.target.value, page: null })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {loading && <p className="status">載入中…</p>}
          {error && <p className="status error">發生錯誤：{error}</p>}
          {!loading && !error && products.length === 0 && <p className="status">找不到符合的商品。</p>}

          <div className="product-grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onClick={() => updateParams({ product: String(p.id) })}
              />
            ))}
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(page) => {
              updateParams({ page: String(page) });
              document.getElementById("root")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </main>
      </div>

      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => updateParams({ product: null })}
        />
      )}
    </div>
  );
}
