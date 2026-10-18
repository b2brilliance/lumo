import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { readAttribution } from "@/components/RefCapture";
import { api, formatApiError } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem("lumo_token");
    if (!t) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("lumo_token");
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("lumo_token", data.token);
      setUser(data.user);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const register = async (payload) => {
    try {
      // Attach the referral code (if any) captured on the very first visit.
      // This is set by <RefCapture/> in App.js — see comments there for the
      // capture-once + 30-day expiry rules.
      let refCode = null;
      try { refCode = localStorage.getItem("lumo_ref_code") || null; } catch { /* private mode */ }
      const attr = readAttribution();
      const withRef = { ...payload, ...(refCode ? { ref_code: refCode } : {}), ...(attr ? { signup_source: attr } : {}) };
      const { data } = await api.post("/auth/register", withRef);
      localStorage.setItem("lumo_token", data.token);
      setUser(data.user);
      // Clear the ref cookie once it's been redeemed so subsequent
      // registrations on the same device don't inherit a stale code.
      if (refCode) {
        try {
          localStorage.removeItem("lumo_ref_code");
          localStorage.removeItem("lumo_ref_code_ts");
        } catch { /* noop */ }
      }
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, error: formatApiError(e) };
    }
  };

  const loginWithSmsResult = (data) => {
    localStorage.setItem("lumo_token", data.token);
    setUser(data.user);
    return { ok: true, user: data.user, is_new: data.is_new };
  };

  const logout = () => {
    localStorage.removeItem("lumo_token");
    setUser(false);
  };

  const updateMe = async (patch) => {
    const { data } = await api.patch("/auth/me", patch);
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, updateMe, loginWithSmsResult }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
