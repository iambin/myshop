interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← 上一頁
      </button>
      <span>
        第 {page} 頁 / 共 {totalPages} 頁
      </span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一頁 →
      </button>
    </div>
  );
}
