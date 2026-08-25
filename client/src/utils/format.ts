const priceFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

export function formatPrice(price: number): string {
  return priceFormatter.format(price);
}
