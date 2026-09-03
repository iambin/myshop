import type { Product } from "../types";
import { formatPrice } from "../utils/format";

interface ProductCardProps {
  product: Product;
  onClick: () => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="product-card"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <img
        src={product.image_url ?? ""}
        alt={product.name}
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (!target.dataset.fallback) {
            target.dataset.fallback = "true";
            target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23e5e7eb'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239ca3af'%3E無圖片%3C/text%3E%3C/svg%3E";
          }
        }}
      />
      <div className="product-card-body">
        <span className="product-category">{product.category_name}</span>
        <h3>{product.name}</h3>
        <p className="product-price">{formatPrice(product.price)}</p>
        {product.stock === 0 && <span className="out-of-stock">已售完</span>}
      </div>
    </div>
  );
}
