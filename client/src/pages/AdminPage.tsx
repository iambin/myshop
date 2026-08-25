import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  checkAdminAuth,
  createProduct,
  deleteProduct,
  fetchCategories,
  fetchProducts,
  updateProduct,
  uploadImage,
} from "../api/client";
import type { Category, Product } from "../types";
import { formatPrice } from "../utils/format";
import { AdminLoginPage } from "./AdminLoginPage";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Pagination } from "../components/Pagination";
import { VisitStatsPanel } from "../components/VisitStatsPanel";

const PAGE_SIZE = 20;

const EMPTY_FORM = {
  name: "",
  description: "",
  specs: "",
  price: "0",
  image_url: "",
  stock: "0",
  category_id: 0,
};

function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // editingId === "new" → creating; number → editing that product; null → form closed
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // deletingProduct !== null → delete confirmation dialog open
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [authed, setAuthed] = useState<boolean | null>(null);

  // List state lives in the URL query string (same pattern as HomePage)
  const page = Number(searchParams.get("page")) || 1;
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const [searchInput, setSearchInput] = useState(q);
  // bumped to refetch after create/update/delete without touching the query string
  const [refreshTick, setRefreshTick] = useState(0);

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  }

  function reload() {
    setRefreshTick((t) => t + 1);
  }

  useEffect(() => {
    checkAdminAuth()
      .then(setAuthed)
      .catch(() => setAuthed(false));
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetchProducts({ page, pageSize: PAGE_SIZE, q, category })
      .then((data) => {
        setProducts(data.items);
        setTotal(data.total);
        // e.g. items were deleted while browsing a now-out-of-range page
        if (data.items.length === 0 && data.total > 0 && page > 1) updateParams({ page: null });
      })
      .catch((e) => setMessage(`載入失敗：${e.message}`))
      .finally(() => setLoading(false));
  }, [page, q, category, authed, refreshTick]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? 0 });
    setEditingId("new");
    setFormError(null);
  }

  function openEdit(p: Product) {
    setForm({
      name: p.name,
      description: p.description,
      specs: p.specs,
      price: String(Math.round(p.price * 100) / 100),
      image_url: p.image_url ?? "",
      stock: String(p.stock),
      category_id: p.category_id,
    });
    setEditingId(p.id);
    setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("請輸入商品名稱");
      return;
    }
    if (!form.category_id) {
      setFormError(categories.length ? "請選擇分類" : "尚無分類，請先至分類管理新增");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const input = {
        ...form,
        image_url: form.image_url.trim() || null,
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
      };
      if (editingId === "new") {
        await createProduct(input);
        setMessage("商品已新增");
        setTimeout(() => setMessage(null), 3000);
      } else if (typeof editingId === "number") {
        await updateProduct(editingId, input);
        setMessage("商品已更新");
        setTimeout(() => setMessage(null), 3000);
      }
      setEditingId(null);
      reload();
    } catch (err) {
      handleAuthedError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingProduct) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProduct(deletingProduct.id);
      setMessage("商品已刪除");
      setTimeout(() => setMessage(null), 3000);
      if (editingId === deletingProduct.id) setEditingId(null);
      setDeletingProduct(null);
      reload();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("401")) {
        setAuthed(false);
        setDeletingProduct(null);
      } else {
        setDeleteError(msg);
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleAuthedError(err: unknown): boolean {
    const msg = (err as Error).message;
    if (msg.includes("401")) {
      setAuthed(false);
      return true;
    }
    setFormError(msg);
    return false;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const { url } = await uploadImage(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      handleAuthedError(err);
    } finally {
      setUploading(false);
    }
  }

  if (authed === null) {
    return <p className="status">載入中…</p>;
  }
  if (!authed) {
    return <AdminLoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="admin">
      <header className="header">
        <Link to="/" className="logo-link">
          常吉園藝 · 後台管理
        </Link>
        <div className="header-actions">
          <button className="btn" onClick={() => navigate("/admin/categories")}>
            分類管理
          </button>
          <button className="btn" onClick={() => navigate("/")}>
            回前台
          </button>
          <button
            className="btn"
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              setAuthed(false);
            }}
          >
            登出
          </button>
        </div>
      </header>

      <main className="admin-main">
        {message && <p className="status ok">{message}</p>}

        <VisitStatsPanel />

        <div className="admin-toolbar">
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: searchInput.trim(), page: null });
            }}
          >
            <input
              type="search"
              placeholder="搜尋商品名稱…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit">搜尋</button>
          </form>
          <select
            aria-label="依分類篩選"
            value={category}
            onChange={(e) => updateParams({ category: e.target.value, page: null })}
          >
            <option value="">全部分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar">
          <span>
            共 {total} 筆商品
            {q && `，搜尋「${q}」`}
            {category && `，分類「${category}」`}
          </span>
          <button className="btn primary" onClick={openCreate}>
            ＋ 新增商品
          </button>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名稱</th>
              <th>分類</th>
              <th>價格</th>
              <th>庫存</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>載入中…</td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6}>查無資料</td>
              </tr>
            )}
            {!loading &&
              products.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.category_name}</td>
                  <td>{formatPrice(p.price)}</td>
                  <td>{p.stock}</td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => openEdit(p)}>
                      編輯
                    </button>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        setDeletingProduct(p);
                        setDeleteError(null);
                      }}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={(p) => updateParams({ page: String(p) })}
        />
      </main>

      {editingId !== null && (
        <Modal
          title={editingId === "new" ? "新增商品" : `編輯商品 #${editingId}`}
          onClose={() => setEditingId(null)}
        >
          <form className="product-form" onSubmit={handleSave}>
            <label>
              名稱 *
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              分類 *
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}
              >
                <option value={0} disabled>
                  請選擇
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                價格 *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onFocus={() => {
                    if (form.price === "0") setForm({ ...form, price: "" });
                  }}
                  onBlur={() => {
                    if (form.price === "") setForm({ ...form, price: "0" });
                  }}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </label>
              <label>
                庫存
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onFocus={() => {
                    if (form.stock === "0") setForm({ ...form, stock: "" });
                  }}
                  onBlur={() => {
                    if (form.stock === "") setForm({ ...form, stock: "0" });
                  }}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
            </div>
            <label>
              圖片網址
              <input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://… 或直接上傳下方檔案"
              />
            </label>
            <label>
              上傳圖片（JPG / PNG / WebP / GIF，最大 5MB）
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} disabled={uploading} />
              {uploading && <span className="uploading-hint">上傳中…</span>}
              {form.image_url.startsWith("/api/uploads/") && (
                <img src={form.image_url} alt="預覽" className="upload-preview" />
              )}
            </label>
            <label>
              描述
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label>
              規格（每行一項）
              <textarea
                rows={4}
                value={form.specs}
                onChange={(e) => setForm({ ...form, specs: e.target.value })}
              />
            </label>
            {formError && <p className="status error">{formError}</p>}
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "儲存中…" : "儲存"}
              </button>
              <button type="button" className="btn" onClick={() => setEditingId(null)}>
                取消
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deletingProduct && (
        <ConfirmDialog
          title="刪除商品"
          message={`確定要刪除「${deletingProduct.name}」嗎？此操作無法復原。`}
          confirmText="刪除"
          busy={deleting}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingProduct(null)}
        />
      )}
    </div>
  );
}

export default AdminPage;
