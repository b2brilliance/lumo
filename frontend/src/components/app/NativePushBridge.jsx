import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { registerPushNotifications } from "@/lib/native";

// Registers the phone for push alerts once someone is logged in to the store app.
export const NativePushBridge = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const uid = user && user.id;
  useEffect(() => {
    if (!uid || !window.Capacitor?.isNativePlatform?.()) return;
    const platform = window.Capacitor.getPlatform?.();
    registerPushNotifications(
      (token) => api.post("/push/native/register", { token, platform }).catch(() => {}),
      (link) => link && nav(link),
    );
  }, [uid]); // eslint-disable-line
  return null;
};
