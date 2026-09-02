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
  const [isZoomed, setIsZoomed] = useState(false);

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
              <button
                type="button"
                className="product-detail-image-btn"
                onClick={() => product.image_url && setIsZoomed(true)}
                title="點擊放大檢視圖片"
                aria-label="點擊放大檢視圖片"
              >
                <img src={product.image_url ?? ""} alt={product.name} />
                <span className="image-zoom-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                  放大檢視
                </span>
              </button>
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
      {isZoomed && product?.image_url && (
        <div
          className="image-lightbox-overlay"
          onClick={() => setIsZoomed(false)}
          role="dialog"
          aria-label="圖片放大預覽"
        >
          <div className="image-lightbox-container" onClick={(e) => e.stopPropagation()}>
            <img src={product.image_url} alt={product.name} className="image-lightbox-img" />
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setIsZoomed(false)}
              aria-label="關閉放大預覽"
              title="關閉放大預覽"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
