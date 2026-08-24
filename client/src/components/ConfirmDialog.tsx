import Modal from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmText = "確認",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-text">{message}</p>
      {error && <p className="status error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn danger" onClick={onConfirm} disabled={busy}>
          {busy ? "處理中…" : confirmText}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
