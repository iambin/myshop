import { Logo } from "./Logo";

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("彰化縣北斗鎮新生里興農路2段390巷6號");

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p className="footer-tagline">花草樹木 · 誠摯為您服務</p>
        </div>
        <div className="footer-contact">
          <h3>聯絡資訊</h3>
          <p>
            📍{" "}
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              彰化縣北斗鎮新生里興農路2段390巷6號
            </a>
          </p>
          <p>
            📞 手機：<a href="tel:0988192050">0988-192-050</a>
          </p>
          <p>
            ☎️ 市話：<a href="tel:048884546">04-8884546</a>
          </p>
          <p>
            💬 LINE ID：<a href="https://line.me/R/ti/p/@iambin" target="_blank" rel="noopener noreferrer">iambin</a>
          </p>
        </div>
        <div className="footer-copyright">
          <p>© {new Date().getFullYear()} 常吉園藝 版權所有</p>
        </div>
      </div>
    </footer>
  );
}
