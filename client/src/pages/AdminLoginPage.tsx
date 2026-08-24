import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function AdminLoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `登入失敗 (${res.status})`);
      }
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin">
      <main className="admin-main">
        <form className="product-form login-form" onSubmit={handleSubmit}>
          <h2>後台管理登入</h2>
          <label>
            管理密碼
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </label>
          {error && <p className="status error">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "登入中…" : "登入"}
            </button>
            <button type="button" className="btn" onClick={() => navigate("/")}>
              回前台
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
