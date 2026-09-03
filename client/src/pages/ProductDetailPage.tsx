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
        <img
          src={product.image_url ?? ""}
          alt={product.name}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (!target.dataset.fallback) {
              target.dataset.fallback = "true";
              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23e5e7eb'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239ca3af'%3E無圖片%3C/text%3E%3C/svg%3E";
            }
          }}
        />
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
              <div className="specs-list">
                {product.specs.split("\n").filter((line) => line.trim()).map((line, i) => {
                  const colonIdx = line.indexOf("：") !== -1 ? line.indexOf("：") : line.indexOf(":");
                  if (colonIdx !== -1) {
                    const key = line.slice(0, colonIdx).trim();
                    const val = line.slice(colonIdx + 1).trim();
                    return (
                      <div key={i} className="spec-row">
                        <span className="spec-label">{key}</span>
                        <span className="spec-value">{val}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="spec-row spec-row-full">
                      <span className="spec-value">{line}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
