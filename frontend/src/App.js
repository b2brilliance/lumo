import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LocaleProvider } from "@/lib/locale";
import { CartProvider } from "@/lib/cart";
import NavBar from "@/components/NavBar";
import MobileTabBar from "@/components/MobileTabBar";
import CacheBuster from "@/components/CacheBuster";
import RefCapture from "@/components/RefCapture";
import ScrollToTop from "@/components/ScrollToTop";
import {
  HowItWorks, ForProviders, ForCustomers, Apply,
  ProviderCity, ProviderCityIndex, CareersCategory, CareersIndex,
  About, Press,
} from "@/pages/MarketingPages";
import NotificationsBridge from "@/components/NotificationsBridge";
import AssistantWidget from "@/components/AssistantWidget";
import AutoTranslator from "@/components/AutoTranslator";
import InstallPrompt from "@/components/InstallPrompt";
import AccessibilityApplier from "@/components/AccessibilityApplier";
import { Toaster } from "@/components/ui/sonner";

import PersonaSplit from "@/pages/PersonaSplit";
import ForYou from "@/pages/ForYou";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import CustomerHub from "@/pages/CustomerHub";
import Insurance from "@/pages/Insurance";
import Training from "@/pages/Training";
import Services from "@/pages/Services";
import ProviderHub from "@/pages/ProviderHub";
import StoreManager from "@/pages/StoreManager";
import Directory from "@/pages/Directory";
import StoreProfile from "@/pages/StoreProfile";
import Marketplace from "@/pages/Marketplace";
import Shop from "@/pages/Shop";
import CityRecruit from "@/pages/CityRecruit";
import CityRecruitIndex from "@/pages/CityRecruitIndex";
import Reset from "@/pages/Reset";
import MapPage from "@/pages/MapPage";
import JobDetail from "@/pages/JobDetail";
import LiveTrack from "@/pages/LiveTrack";
import BecomeProvider from "@/pages/BecomeProvider";
import ListYourStuff from "@/pages/ListYourStuff";
import CitiesIndex from "@/pages/CitiesIndex";
import CityHub from "@/pages/CityHub";
import OrderService from "@/pages/OrderService";
import RemoteJobs from "@/pages/RemoteJobs";
import RegionHub from "@/pages/RegionHub";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancel from "@/pages/CheckoutCancel";
import Wallet from "@/pages/Wallet";
import Settings from "@/pages/Settings";
import OrderFinalPay from "@/pages/OrderFinalPay";
import ChatsInbox from "@/pages/ChatsInbox";
import Orders from "@/pages/Orders";
import CredentialsPage from "@/pages/CredentialsPage";
import Cart from "@/pages/Cart";
import Rentals from "@/pages/Rentals";
import RentalDetail from "@/pages/RentalDetail";
import RentalHost from "@/pages/RentalHost";
import RentalInbox from "@/pages/RentalInbox";
import AdminConsole from "@/pages/AdminConsole";
import LandingPage from "@/pages/LandingPage";
import JobApply from "@/pages/JobApply";
import RealEstate from "@/pages/RealEstate";
import RealEstateDetail from "@/pages/RealEstateDetail";
import RealEstateList from "@/pages/RealEstateList";
import RealEstateSaved from "@/pages/RealEstateSaved";
import Autos from "@/pages/Autos";
import AutoDetail from "@/pages/AutoDetail";
import AutoList from "@/pages/AutoList";
import Inquiries from "@/pages/Inquiries";
import PageviewPinger from "@/components/PageviewPinger";
import SignIn from "@/pages/SignIn";
import SiteFooter from "@/components/SiteFooter";
import { AboutPage, ContactPage, TermsPage, PrivacyPage } from "@/pages/LegalPages";
import BlogIndex from "@/pages/BlogIndex";
import BlogPost from "@/pages/BlogPost";
import ErrorBoundary from "@/components/ErrorBoundary";
import { initNativeShell } from "@/lib/native";

if (typeof window !== "undefined") {
  // Boot native bridge once. No-op when running in a regular browser.
  initNativeShell();
}

// Where each role considers "home". Wrong-role hits any siloed route
// get silently punted here (P2P pivot: no cross-role UX bleed).
const HOME_FOR_ROLE = {
  customer: "/",
  provider: "/provider",
  admin: "/admin",
};

function homeFor(user) {
  if (!user || user === false) return "/";
  return HOME_FOR_ROLE[user.role] || "/";
}

// CustomerOnly — allows guests + customers, silently redirects
// providers/admins to their own home. Used on customer-specific flows
// (order wizard, cart) so wrong-role logins don't accidentally see them.
function CustomerOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;
  if (user && user !== false && user.role !== "customer") {
    return <Navigate to={homeFor(user)} replace />;
  }
  return children;
}

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;
  if (!user || user === false) return <Navigate to="/signin" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

// Landing gate — if a provider/admin lands on "/", silently send them
// to their own dashboard. Guests + customers see the marketing landing.
function RoleAwareLanding() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-12 text-slate-500">Loading…</div>;
  if (user && user !== false && user.role !== "customer") {
    return <Navigate to={homeFor(user)} replace />;
  }
  return <PersonaSplit />;
}

function App() {
  return (
    <HelmetProvider>
      <div className="App grain">
        <CacheBuster />
        <BrowserRouter>
        <LocaleProvider>
          <AuthProvider>
            <CartProvider>
              <NavBar />
              <ScrollToTop />
              <RefCapture />
              <NotificationsBridge />
              <AutoTranslator />
              <AccessibilityApplier />
              <PageviewPinger />
              <ErrorBoundary
                label="this page"
                onReset={() => { window.location.href = "/"; }}
                resetLabel="home"
                testid="app-error"
              >
              <Routes>
            <Route path="/" element={<RoleAwareLanding />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/register" element={<Register />} />

            {/* /customer → redirect to homepage. Customers now start on the
                service grid (no separate hub page). */}
            <Route path="/customer" element={<Navigate to="/for-you" replace />} />
            <Route path="/for-you" element={<ForYou />} />
            <Route path="/for-work" element={<Navigate to="/become-a-provider" replace />} />
            <Route path="/market" element={<Navigate to="/marketplace" replace />} />
            <Route path="/estate" element={<Navigate to="/real-estate" replace />} />
            <Route path="/insurance" element={<Insurance />} />
            <Route path="/training" element={<Training />} />
            <Route path="/services" element={<Services />} />
            <Route path="/provider" element={<Protected roles={["provider"]}><ProviderHub /></Protected>} />
            <Route path="/retailer" element={<Navigate to="/services" replace />} />
            <Route path="/restaurant" element={<Navigate to="/services" replace />} />
            {/* Legacy business-storefront routes — Lumo is P2P-only now.
             * Redirect to /services so nobody hits a broken page from a
             * bookmark or shared link. */}
            <Route path="/stores" element={<Navigate to="/services" replace />} />
            <Route path="/stores/:id" element={<Navigate to="/services" replace />} />
            <Route path="/restaurants" element={<Navigate to="/services" replace />} />
            <Route path="/restaurants/:id" element={<Navigate to="/services" replace />} />
            <Route path="/marketplaces" element={<Navigate to="/marketplace" replace />} />
            <Route path="/rentals" element={<Rentals />} />
            <Route path="/rentals/host" element={<Protected><RentalHost /></Protected>} />
            <Route path="/rentals/inbox" element={<Protected><RentalInbox /></Protected>} />
            <Route path="/rentals/:id" element={<RentalDetail />} />
            <Route path="/autos" element={<Autos />} />
            <Route path="/autos/list" element={<Protected><AutoList /></Protected>} />
            <Route path="/autos/:id" element={<AutoDetail />} />
            <Route path="/real-estate" element={<RealEstate />} />
            <Route path="/real-estate/list" element={<Protected><RealEstateList /></Protected>} />
            <Route path="/real-estate/saved" element={<RealEstateSaved />} />
            <Route path="/real-estate/:id" element={<RealEstateDetail />} />

            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/new" element={<Marketplace />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/join" element={<CityRecruitIndex />} />
            <Route path="/join/:slug" element={<CityRecruit />} />
            <Route path="/reset" element={<Reset />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/jobs/:id/track" element={<Protected><LiveTrack /></Protected>} />
            <Route path="/become-a-provider" element={<BecomeProvider />} />
            <Route path="/list-your-stuff" element={<ListYourStuff />} />
            <Route path="/sell-on-lumo" element={<ListYourStuff />} />
            <Route path="/earn" element={<BecomeProvider />} />
            <Route path="/cities" element={<CitiesIndex />} />
            <Route path="/cities/:slug" element={<CityHub />} />
            <Route path="/order/:service" element={<CustomerOnly><OrderService /></CustomerOnly>} />
            <Route path="/order" element={<CustomerOnly><OrderService /></CustomerOnly>} />
            <Route path="/remote-jobs" element={<RemoteJobs />} />
            <Route path="/regions/:slug" element={<RegionHub />} />
            <Route path="/regions" element={<RegionHub />} />

            {/* Marketing / SEO pages (recruiting-focused per Feb 2026) */}
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/for-providers" element={<ForProviders />} />
            <Route path="/for-customers" element={<ForCustomers />} />
            <Route path="/apply" element={<Apply />} />
            <Route path="/providers" element={<ProviderCityIndex />} />
            <Route path="/providers/:city" element={<ProviderCity />} />
            <Route path="/careers" element={<CareersIndex />} />
            <Route path="/careers/:category" element={<CareersCategory />} />
            <Route path="/about" element={<About />} />
            <Route path="/press" element={<Press />} />

            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            <Route path="/orders/:id/pay" element={<Protected><OrderFinalPay /></Protected>} />

            <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
            <Route path="/chats" element={<Protected><ChatsInbox /></Protected>} />
            <Route path="/messages" element={<Protected><ChatsInbox /></Protected>} />
            <Route path="/orders" element={<Protected><Orders /></Protected>} />
            <Route path="/credentials" element={<Protected roles={["provider"]}><CredentialsPage /></Protected>} />
            <Route path="/cart" element={<Protected roles={["customer"]}><Cart /></Protected>} />
            <Route path="/admin" element={<Protected roles={["admin"]}><AdminConsole /></Protected>} />
            <Route path="/inquiries" element={<Protected><Inquiries /></Protected>} />
            <Route path="/inquiries/:id" element={<Protected><Inquiries /></Protected>} />
            <Route path="/work/:category" element={<LandingPage pageType="work" />} />
            <Route path="/work/:category/:city" element={<LandingPage pageType="work" />} />
            <Route path="/find-help/:category" element={<LandingPage pageType="find-help" />} />
            <Route path="/find-help/:category/:city" element={<LandingPage pageType="find-help" />} />
            <Route path="/sell/:category" element={<LandingPage pageType="sell" />} />
            <Route path="/sell/:category/:city" element={<LandingPage pageType="sell" />} />
            <Route path="/rent-out/:category" element={<LandingPage pageType="rent-out" />} />
            <Route path="/rent-out/:category/:city" element={<LandingPage pageType="rent-out" />} />
            <Route path="/jobs/apply/:category" element={<JobApply />} />
            <Route path="/jobs/apply/:category/:city" element={<JobApply />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/blog" element={<BlogIndex />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            {/* Catch-all: admin subpaths → /admin, everything else → home.
                Prevents the "blank screen" after closing nested pages. */}
            <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
              </ErrorBoundary>
          <SiteFooter />
          {/* Bottom padding for mobile so the fixed tab bar doesn't hide the footer */}
          <div className="md:hidden h-14" aria-hidden />
          <MobileTabBar />
          <Toaster position="top-right" richColors />
            <AssistantWidget />
            <InstallPrompt />
            </CartProvider>
          </AuthProvider>
        </LocaleProvider>
      </BrowserRouter>
      </div>
    </HelmetProvider>
  );
}

export default App;
