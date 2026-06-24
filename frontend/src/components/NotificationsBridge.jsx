import { useAuth } from "@/lib/auth";
import useNotifications from "@/hooks/useNotifications";

export default function NotificationsBridge() {
  const { user } = useAuth();
  useNotifications({ enabled: !!user && user !== false });
  return null;
}
