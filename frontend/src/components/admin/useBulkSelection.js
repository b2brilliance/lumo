import { useCallback, useMemo, useState } from "react";

/* useBulkSelection
 * ─────────────────
 * Lightweight primitive for wiring "select many rows, apply an action"
 * flows in admin tables. Give it the current page's items (each with
 * a stable `id`) and get back: a Set of selected ids, per-row toggle,
 * select-all, clear, and a helper `isSelected(id)`.
 *
 * Deliberately NOT persisted across renders/pagination — bulk actions
 * are point-in-time; when the caller reloads the list, selection
 * naturally clears.
 */
export default function useBulkSelection(items = []) {
  const [selected, setSelected] = useState(() => new Set());

  const ids = useMemo(() => new Set(items.map((i) => i?.id).filter(Boolean)), [items]);

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const allSelected = ids.size > 0 && [...ids].every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      // If all visible are already selected, clear (deselect just the
      // visible ones — leaves any cross-page selection alone if the
      // caller uses a global source of ids). Otherwise select all
      // visible.
      const allNow = ids.size > 0 && [...ids].every((id) => prev.has(id));
      const next = new Set(prev);
      if (allNow) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [ids]);

  const isSelected = useCallback((id) => selected.has(id), [selected]);

  return {
    selected,               // Set<string>
    selectedIds: [...selected],
    count: selected.size,
    isSelected,
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected,
  };
}
