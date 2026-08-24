import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import AdminPage from "./pages/AdminPage";
import CategoriesAdminPage from "./pages/CategoriesAdminPage";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/categories" element={<CategoriesAdminPage />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
