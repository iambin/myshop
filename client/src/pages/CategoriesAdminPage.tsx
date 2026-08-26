import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  checkAdminAuth,
  createCategory,
  deleteCategory,
  fetchCategoriesWithCount,
  updateCategory,
  type CategoryWithCount,
} from "../api/client";
import { AdminLoginPage } from "./AdminLoginPage";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

function categoryStatus(c: CategoryWithCount): { label: string; cls: string } {
  if (!c.is_active) return { label: "已下架", cls: "off" };
  if (c.active_product_count === 0)
    return { label: "啟用中（暫無上架商品，前台隱藏）", cls: "auto" };
  return { label: "上架", cls: "on" };
}

function CategoriesAdminPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // editingId === "new" → creating; number → editing that category; null → idle
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [activeInput, setActiveInput] = useState(true);
  // storedFlag = the category's persisted is_active; activeTouched = the
  // user flipped the checkbox this session. Together they let handleSave
  // keep is_active=1 for an untouched auto-delisted category.
  const activeStateRef = useRef({ storedFlag: true });
  const [activeTouched, setActiveTouched] = useState(false);
  const [sortOrderInput, setSortOrderInput] = useState("99");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setNameInput("");
    setActiveInput(true);
    setActiveTouched(false);
    activeStateRef.current = { storedFlag: true };
    setSortOrderInput("99");
    setEditingId("new");
    setError(null);
  }

  function openEdit(c: CategoryWithCount) {
    setNameInput(c.name);
    // reflect the effective storefront state: manually delisted OR
    // auto-delisted (no active products) both mean "not shown"
    setActiveInput(c.is_active !== 0 && c.active_product_count > 0);
    setActiveTouched(false);
    activeStateRef.current = { storedFlag: c.is_active !== 0 };
    setSortOrderInput(String(c.sort_order));
    setEditingId(c.id);
    setError(null);
  }

  // deletingCategory !== null → delete confirmation dialog open
  const [deletingCategory, setDeletingCategory] = useState<CategoryWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [authed, setAuthed] = useState<boolean | null>(null);

  function load() {
    setLoading(true);
    fetchCategoriesWithCount()
      .then(setCategories)
      .catch((e) => setMessage(`載入失敗：${e.message}`))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    checkAdminAuth()
      .then(setAuthed)
      .catch(() => setAuthed(false));
  }, []);

  // list endpoint (?all=1) needs the admin cookie → load only after auth passes
  useEffect(() => {
    if (authed) load();
  }, [authed]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) {
      setError("請輸入分類名稱");
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      name: nameInput.trim(),
      // untouched auto-delisted category (checkbox shows unchecked but the
      // stored flag is 1) keeps is_active=1 so relisting a product restores
      // it; only an explicit untick by the user writes a manual delist
      is_active: activeInput || (!activeTouched && activeStateRef.current.storedFlag) ? 1 : 0,
      sort_order: Math.max(0, Math.round(Number(sortOrderInput) || 0)),
    };
    try {
      if (editingId === "new") await createCategory(input);
      else if (typeof editingId === "number") await updateCategory(editingId, input);
      setMessage(editingId === "new" ? "分類已新增" : "分類已更新");
      setTimeout(() => setMessage(null), 3000);
      setEditingId(null);
      load();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("401")) setAuthed(false);
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingCategory) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCategory(deletingCategory.id);
      setMessage("分類已刪除");
      setTimeout(() => setMessage(null), 3000);
      setDeletingCategory(null);
      load();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("401")) {
        setAuthed(false);
        setDeletingCategory(null);
      } else {
        setDeleteError(msg);
      }
    } finally {
      setDeleting(false);
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
        <Link to="/admin" className="logo-link">
          常吉園藝 · 後台管理
        </Link>
        <div className="header-actions">
          <button className="btn" onClick={() => navigate("/admin")}>
            商品管理
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

        <button
          className="btn primary"
          onClick={openCreate}
        >
          ＋ 新增分類
        </button>

        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名稱</th>
              <th>上架商品數</th>
              <th>排序</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6}>載入中…</td>
              </tr>
            )}
            {!loading && categories.length === 0 && (
              <tr>
                <td colSpan={6}>查無資料</td>
              </tr>
            )}
            {!loading &&
              categories.map((c) => {
                const st = categoryStatus(c);
                return (
                  <tr key={c.id} className={st.cls === "on" ? "" : "row-inactive"}>
                    <td>{c.id}</td>
                    <td>{c.name}</td>
                    <td>{c.active_product_count}</td>
                    <td>{c.sort_order}</td>
                    <td>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="row-actions">
                      <button className="btn small" onClick={() => openEdit(c)}>
                        編輯
                      </button>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        setDeletingCategory(c);
                        setDeleteError(null);
                      }}
                    >
                      刪除
                    </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </main>

      {editingId !== null && (
        <Modal
          title={editingId === "new" ? "新增分類" : "編輯分類"}
          onClose={() => setEditingId(null)}
        >
          <form className="product-form category-form" onSubmit={handleSave}>
            <label>
              分類名稱 *
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus required />
            </label>
            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={activeInput}
                  onChange={(e) => {
                    setActiveInput(e.target.checked);
                    setActiveTouched(true);
                  }}
                />
                啟用中（前台顯示此分類；無上架商品時自動下架）
              </label>
              <label>
                排序
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={sortOrderInput}
                  onChange={(e) => setSortOrderInput(e.target.value)}
                />
              </label>
            </div>
            {typeof editingId === "number" &&
              (() => {
                const c = categories.find((x) => x.id === editingId);
                if (!c || c.is_active === 0 || c.active_product_count > 0) return null;
                return (
                  <p className="status">
                    此分類仍為啟用，只是暫無上架商品所以前台隱藏；商品（重新）上架後會自動恢復顯示，
                    新增商品時也可正常選用此分類。
                  </p>
                );
              })()}
            {error && <p className="status error">{error}</p>}
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

      {deletingCategory && (
        <ConfirmDialog
          title="刪除分類"
          message={`確定要刪除分類「${deletingCategory.name}」嗎？此操作無法復原。`}
          confirmText="刪除"
          busy={deleting}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingCategory(null)}
        />
      )}
    </div>
  );
}

export default CategoriesAdminPage;
