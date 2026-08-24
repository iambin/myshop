import { Link } from "react-router-dom";
import type { Product } from "../types";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/products/${product.id}`} className="product-card">
      <img src={product.image_url ?? ""} alt={product.name} loading="lazy" />
      <div className="product-card-body">
        <span className="product-category">{product.category_name}</span>
        <h3>{product.name}</h3>
        <p className="product-price">${product.price.toFixed(2)}</p>
        {product.stock === 0 && <span className="out-of-stock">已售完</span>}
      </div>
    </Link>
  );
}
