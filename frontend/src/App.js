import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LocaleProvider } from "@/lib/locale";
import { CartProvider } from "@/lib/cart";
import NavBar from "@/components/NavBar";
import NotificationsBridge from "@/components/NotificationsBridge";
import AssistantWidget from "@/components/AssistantWidget";
import AutoTranslator from "@/components/AutoTranslator";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import CustomerHub from "@/pages/CustomerHub";
import ProviderHub from "@/pages/ProviderHub";
import StoreManager from "@/pages/StoreManager";
import Directory from "@/pages/Directory";
import StoreProfile from "@/pages/StoreProfile";
import Marketplace from "@/pages/Marketplace";
import MapPage from "@/pages/MapPage";
import JobDetail from "@/pages/JobDetail";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancel from "@/pages/CheckoutCancel";
import Wallet from "@/pages/Wallet";
import Settings from "@/pages/Settings";
import OrderFinalPay from "@/pages/OrderFinalPay";
import ChatsInbox from "@/pages/ChatsInbox";
import CredentialsPage from "@/pages/CredentialsPage";
import Cart from "@/pages/Cart";
import Rentals from "@/pages/Rentals";
import RentalDetail from "@/pages/RentalDetail";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;
  if (!user || user === false) return <Navigate to="/login" state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

function App() {
  return (
    <div className="App grain">
      <BrowserRouter>
        <LocaleProvider>
          <AuthProvider>
            <CartProvider>
              <NavBar />
              <NotificationsBridge />
              <AutoTranslator />
              <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route path="/customer" element={<Protected roles={["customer", "provider", "retailer", "restaurant"]}><CustomerHub /></Protected>} />
            <Route path="/provider" element={<Protected roles={["provider"]}><ProviderHub /></Protected>} />
            <Route path="/retailer" element={<Protected roles={["retailer"]}><StoreManager role="retailer" /></Protected>} />
            <Route path="/restaurant" element={<Protected roles={["restaurant"]}><StoreManager role="restaurant" /></Protected>} />

            <Route path="/stores" element={<Directory role="retailer" />} />
            <Route path="/restaurants" element={<Directory role="restaurant" />} />
            <Route path="/stores/:id" element={<StoreProfile role="retailer" />} />
            <Route path="/restaurants/:id" element={<StoreProfile role="restaurant" />} />

            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/jobs/:id" element={<JobDetail />} />

            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            <Route path="/orders/:id/pay" element={<Protected><OrderFinalPay /></Protected>} />

            <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
            <Route path="/chats" element={<Protected><ChatsInbox /></Protected>} />
            <Route path="/credentials" element={<Protected roles={["provider"]}><CredentialsPage /></Protected>} />
            <Route path="/cart" element={<Protected><Cart /></Protected>} />
            <Route path="/rentals" element={<Rentals />} />
            <Route path="/rentals/:id" element={<RentalDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <Toaster position="top-right" richColors />
            <AssistantWidget />
            </CartProvider>
          </AuthProvider>
        </LocaleProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
