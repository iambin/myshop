import { useEffect, useState } from "react";
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

function CategoriesAdminPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // editingId === "new" → creating; number → renaming; null → idle
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) {
      setError("請輸入分類名稱");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId === "new") await createCategory(nameInput.trim());
      else if (typeof editingId === "number") await updateCategory(editingId, nameInput.trim());
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
    return <AdminLoginPage onLogin={() => { setAuthed(true); load(); }} />;
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
          onClick={() => {
            setNameInput("");
            setEditingId("new");
            setError(null);
          }}
        >
          ＋ 新增分類
        </button>

        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名稱</th>
              <th>商品數</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4}>載入中…</td>
              </tr>
            )}
            {!loading &&
              categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.product_count}</td>
                  <td className="row-actions">
                    <button
                      className="btn small"
                      onClick={() => {
                        setNameInput(c.name);
                        setEditingId(c.id);
                        setError(null);
                      }}
                    >
                      改名
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
              ))}
          </tbody>
        </table>
      </main>

      {editingId !== null && (
        <Modal
          title={editingId === "new" ? "新增分類" : "重新命名分類"}
          onClose={() => setEditingId(null)}
        >
          <form className="product-form category-form" onSubmit={handleSave}>
            <label>
              分類名稱 *
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} autoFocus required />
            </label>
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
