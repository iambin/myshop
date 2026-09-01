import { useEffect, useState } from "react";
import { fetchProduct } from "../api/client";
import type { Product } from "../types";
import { formatPrice } from "../utils/format";
import Modal from "./Modal";

interface ProductDetailModalProps {
  productId: string;
  onClose: () => void;
}

export function ProductDetailModal({ productId, onClose }: ProductDetailModalProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchProduct(productId)
      .then(setProduct)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <Modal title={product?.name || "商品詳情"} onClose={onClose}>
      <div className="product-detail-modal">
        {loading && <p className="status">載入中…</p>}
        {error && <p className="status error">發生錯誤：{error}</p>}
        {!loading && !error && product && (
          <div className="product-detail-content">
            <div className="product-detail-image-wrap">
              <img src={product.image_url ?? ""} alt={product.name} />
            </div>
            <div className="product-detail-info">
              <span className="category">{product.category_name}</span>
              <h2 className="product-detail-title">{product.name}</h2>
              <p className="price">{formatPrice(product.price)}</p>
              <p className={product.stock > 0 ? "in-stock" : "out-of-stock"}>
                {product.stock > 0 ? `有庫存（${product.stock} 件）` : "已售完"}
              </p>
              <p className="description">{product.description}</p>
              {product.specs && (
                <div className="specs">
                  <h3>商品規格</h3>
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
        )}
      </div>
    </Modal>
  );
}
