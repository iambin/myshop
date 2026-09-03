import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  checkAdminAuth,
  createProduct,
  deleteProduct,
  fetchCategoriesWithCount,
  fetchProducts,
  retireImage,
  updateProduct,
  uploadImage,
  type CategoryWithCount,
} from "../api/client";
import type { Product } from "../types";
import { formatPrice } from "../utils/format";
import { AdminLoginPage } from "./AdminLoginPage";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Pagination } from "../components/Pagination";
import { VisitStatsPanel } from "../components/VisitStatsPanel";
import { Logo } from "../components/Logo";

const PAGE_SIZE = 20;

const DEFAULT_SPECS = "品名：\n高度：\n寬度：\n容器：\n";

const EMPTY_FORM = {
  name: "",
  description: "",
  specs: DEFAULT_SPECS,
  price: "0",
  image_url: "",
  stock: "0",
  category_id: 0,
  is_active: true,
  sort_order: "999",
};

function AdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
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

  // Admin selects use every ENABLED category, including ones with no products yet —
  // otherwise a brand-new category (auto-hidden publicly) could never be picked.
  const enabledCategories = categories.filter((c) => c.is_active !== 0);

  useEffect(() => {
    checkAdminAuth()
      .then((ok) => {
        setAuthed(ok);
        // all=1 needs the admin cookie → load only after auth passes (same as CategoriesAdminPage)
        if (ok) fetchCategoriesWithCount().then(setCategories).catch(() => setCategories([]));
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetchProducts({ page, pageSize: PAGE_SIZE, q, category, all: true })
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
    setForm({ ...EMPTY_FORM, category_id: enabledCategories[0]?.id ?? 0 });
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
      is_active: p.is_active !== 0,
      sort_order: String(p.sort_order),
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
        is_active: form.is_active ? 1 : 0,
        sort_order: Math.max(0, Math.round(Number(form.sort_order) || 0)),
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

  // Editing a product whose category was manually disabled afterwards → keep it in
  // the dropdown so the current value stays visible instead of showing blank.
  const formCategoryOptions =
    typeof editingId === "number" && !enabledCategories.some((c) => c.id === form.category_id)
      ? [...enabledCategories, ...categories.filter((c) => c.id === form.category_id)]
      : enabledCategories;

  return (
    <div className="admin">
      <header className="header">
        <Link to="/" className="logo-link">
          <Logo /> · 後台管理
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
              if (!authed) return;
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
              placeholder="搜尋商品、分類或規格…"
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
            {enabledCategories.map((c) => (
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
              <th>排序</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="table-empty-cell">載入中…</td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty-cell">查無資料</td>
              </tr>
            )}
            {!loading &&
              products.map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "row-inactive"}>
                  <td data-label="ID">{p.id}</td>
                  <td data-label="名稱" className="cell-primary-text">{p.name}</td>
                  <td data-label="分類">{p.category_name}</td>
                  <td data-label="價格">{formatPrice(p.price)}</td>
                  <td data-label="庫存">{p.stock}</td>
                  <td data-label="排序">{p.sort_order}</td>
                  <td data-label="狀態">
                    <span className={p.is_active ? "badge on" : "badge off"}>
                      {p.is_active ? "上架" : "下架"}
                    </span>
                  </td>
                  <td data-label="操作" className="row-actions">
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
          onChange={(p) => {
            updateParams({ page: String(p) });
            document.getElementById("root")?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </main>

      {editingId !== null && (
        <Modal
          title={editingId === "new" ? "新增商品" : `編輯商品 #${editingId}`}
          onClose={() => setEditingId(null)}
        >
          <form className="product-form" onSubmit={handleSave}>
            <div className="form-body">
            <fieldset className="form-section">
              <legend>基本資料</legend>
              <div className="form-grid">
                <label>
                  <span className="label-text">名稱 <span className="required">*</span></span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span className="label-text">分類 <span className="required">*</span></span>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}
                  >
                    <option value={0} disabled>
                      請選擇
                    </option>
                    {formCategoryOptions.map((c) => (
                      <option key={c.id} value={c.id} disabled={c.is_active === 0}>
                        {c.name}
                        {c.is_active === 0 ? "（已下架，請至分類管理啟用）" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>定價與庫存</legend>
              <div className="form-grid">
                <label>
                  <span className="label-text">價格 <span className="required">*</span></span>
                  <input
                    type="number"
                    min="0"
                    step="1"
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
                  <span className="label-text">庫存</span>
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
                <label>
                  <span className="label-text">排序</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  />
                </label>
                <label>
                  <span className="label-text">狀態</span>
                  <span className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    <span>上架中</span>
                  </span>
                  <span className="field-hint">取消勾選則前台不顯示</span>
                </label>
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>商品圖片</legend>
              <div className="form-grid form-grid-upload">
                <label>
                  <span className="label-text">圖片網址</span>
                  <div className="input-with-btn">
                    <input
                      value={form.image_url}
                      readOnly
                      placeholder="請使用下方上傳"
                    />
                    {form.image_url && (
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={async () => {
                          const url = form.image_url;
                          setForm((f) => ({ ...f, image_url: "" }));
                          if (url.startsWith("/api/uploads/")) {
                            try { await retireImage(url); } catch { /* best-effort */ }
                          }
                        }}
                      >
                        移除
                      </button>
                    )}
                  </div>
                </label>
                <label>
                  <span className="label-text">上傳圖片</span>
                  <div className="upload-area">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} disabled={uploading} />
                    {uploading && <span className="uploading-hint">上傳中…</span>}
                    <p className="upload-hint">JPG / PNG / WebP / GIF，最大 5MB</p>
                  </div>
                </label>
              </div>
              {form.image_url.startsWith("/api/uploads/") && (
                <img src={form.image_url} alt="預覽" className="upload-preview" />
              )}
            </fieldset>

            <fieldset className="form-section">
              <legend>詳細內容</legend>
              <div className="form-grid form-grid-tall">
                <label>
                  <span className="label-text">描述</span>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="商品詳細描述…"
                  />
                </label>
                <label>
                  <span className="label-text">規格（每行一項）</span>
                  <textarea
                    rows={4}
                    value={form.specs}
                    onChange={(e) => setForm({ ...form, specs: e.target.value })}
                    placeholder="例：品名：&#10;高度：&#10;寬度：&#10;容器："
                  />
                </label>
              </div>
            </fieldset>

            {formError && <p className="status error">{formError}</p>}
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setEditingId(null)}>
                取消
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "儲存中…" : "儲存"}
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
