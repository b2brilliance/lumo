// Per-user cart context. Hydrates from /api/cart on login, exposes add/update/remove/checkout.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CartContext = createContext(null);

const empty = { groups: [], total_items: 0, grand_subtotal_usd: 0 };

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(empty);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user === false) { setCart(empty); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/cart");
      setCart(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (inventory_item_id, quantity = 1) => {
    const { data } = await api.post("/cart/add", { inventory_item_id, quantity });
    setCart(data);
    return data;
  }, []);

  const updateItem = useCallback(async (cart_item_id, quantity) => {
    const { data } = await api.patch(`/cart/items/${cart_item_id}`, { quantity });
    setCart(data);
    return data;
  }, []);

  const removeItem = useCallback(async (cart_item_id) => {
    const { data } = await api.delete(`/cart/items/${cart_item_id}`);
    setCart(data);
    return data;
  }, []);

  const clearStore = useCallback(async (store_id) => {
    const { data } = await api.delete(`/cart/store/${store_id}`);
    setCart(data);
    return data;
  }, []);

  const checkoutStore = useCallback(async (store_id, opts = {}) => {
    const body = {
      store_id,
      delivery_address: opts.delivery_address || null,
      delivery_fee: opts.delivery_fee || 0,
      notes: opts.notes || null,
      origin_url: window.location.origin,
      allowed_payment_methods: opts.allowed_payment_methods,
      payment_terms: opts.payment_terms,
      country: opts.country,
      us_state: opts.us_state,
    };
    const { data } = await api.post("/cart/checkout", body);
    window.location.href = data.url;
    return data;
  }, []);

  return (
    <CartContext.Provider value={{
      cart, loading, refresh, add, updateItem, removeItem, clearStore, checkoutStore
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
