import React from "react";
import { Trash2, X } from "lucide-react";

/* BulkActionsBar
 * ───────────────
 * Floating pill that appears at the bottom of any admin table when
 * ≥1 row is selected. Slot-based — pass in whatever action buttons
 * make sense for the tab (delete, ban, feature, approve, …).
 *
 * Example:
 *   <BulkActionsBar count={sel.count} onClear={sel.clear}>
 *     <BulkActionButton variant="danger" onClick={handleDelete}>Delete</BulkActionButton>
 *     <BulkActionButton onClick={handleBan}>Ban</BulkActionButton>
 *   </BulkActionsBar>
 */
export default function BulkActionsBar({ count = 0, onClear, children, testId = "admin-bulk-bar" }) {
  if (!count) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white shadow-2xl border border-slate-700 flex items-center gap-1 px-2 py-2 rounded-full max-w-[95vw]"
      role="region"
      aria-label="Bulk actions"
      data-testid={testId}
    >
      <div className="px-3 py-1 font-mono text-xs uppercase tracking-widest whitespace-nowrap" data-testid={`${testId}-count`}>
        {count} selected
      </div>
      <div className="w-px h-6 bg-slate-700" />
      <div className="flex items-center gap-1 overflow-x-auto">
        {children}
      </div>
      <div className="w-px h-6 bg-slate-700" />
      <button
        onClick={onClear}
        className="p-1.5 rounded-full hover:bg-slate-700 transition-colors"
        aria-label="Clear selection"
        data-testid={`${testId}-clear`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function BulkActionButton({ children, onClick, variant = "default", disabled = false, testId }) {
  const variants = {
    default: "hover:bg-slate-700 text-white",
    danger:  "hover:bg-red-600 text-white",
    warning: "hover:bg-amber-600 text-white",
    success: "hover:bg-teal-600 text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant] || variants.default}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/* Row + header checkbox with the exact styling used across admin tabs.
   Small helper so every tab renders a consistent tick box. */
export function BulkCheckbox({ checked, indeterminate, onChange, ariaLabel = "Select row", testId, disabled }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer disabled:cursor-not-allowed"
      checked={Boolean(checked)}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
    />
  );
}

/* DangerBulkIcon — thin convenience so danger actions read consistently */
export function DangerBulkIcon() {
  return <Trash2 className="w-3.5 h-3.5" />;
}
