import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProduct } from "../api/client";
import type { Product } from "../types";
import { formatPrice } from "../utils/format";

export function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProduct(null);
    setError(null);
    fetchProduct(id!)
      .then(setProduct)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="detail">
        <p className="status error">發生錯誤：{error}</p>
        <Link to="/" className="back-link">
          ← 返回商品列表
        </Link>
      </div>
    );
  }
  if (!product) {
    return <p className="status">載入中…</p>;
  }

  return (
    <div className="detail">
      <Link to="/" className="back-link">
        ← 返回商品列表
      </Link>
      <div className="detail-body">
        <img src={product.image_url ?? ""} alt={product.name} />
        <div className="detail-info">
          <span className="category">{product.category_name}</span>
          <h1>{product.name}</h1>
          <p className="price">{formatPrice(product.price)}</p>
          <p className={product.stock > 0 ? "in-stock" : "out-of-stock"}>
            {product.stock > 0 ? `有庫存（${product.stock} 件）` : "已售完"}
          </p>
          <p className="description">{product.description}</p>
          {product.specs && (
            <div className="specs">
              <h2>商品規格</h2>
              {product.specs.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
