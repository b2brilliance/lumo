import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_SCHEMAS } from "@/lib/serviceSchemas";

function fieldVisible(field, details) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, v]) => details[k] === v);
}

function FieldRenderer({ field, value, onChange }) {
  if (field.type === "select") {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="mt-1" data-testid={`detail-${field.name}`}>
          <SelectValue placeholder={field.placeholder || "Choose…"} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step || 1}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
        placeholder={field.placeholder}
        className="mt-1"
        data-testid={`detail-${field.name}`}
      />
    );
  }
  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? value : [];
    const toggle = (v) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    return (
      <div className="mt-2 grid grid-cols-2 gap-1.5" data-testid={`detail-${field.name}`}>
        {field.options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer" data-testid={`detail-${field.name}-${o.value}`}>
            <Checkbox checked={arr.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  // text fallback
  return (
    <Input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="mt-1"
      data-testid={`detail-${field.name}`}
    />
  );
}

export default function ServiceDetailsForm({ category, details, onChange }) {
  const schema = SERVICE_SCHEMAS[category];

  // Reset details when category changes and current fields don't match
  // (parent controls details, just guards rendering)

  const fields = useMemo(() => {
    if (!schema) return [];
    const sub = details.subcategory && schema.subcategories?.[details.subcategory];
    return [
      ...(schema.baseFields || []),
      ...(sub?.fields || []),
    ];
  }, [schema, details.subcategory]);

  if (!schema) return null;

  const set = (k, v) => onChange({ ...details, [k]: v });

  return (
    <div className="space-y-4 border border-slate-200 p-4 bg-slate-50/40" data-testid="service-details">
      <div className="overline">Service details</div>
      <div>
        <Label className="overline">{schema.subcategoryLabel || "Subcategory"}</Label>
        <Select value={details.subcategory || ""} onValueChange={(v) => set("subcategory", v)}>
          <SelectTrigger className="mt-1" data-testid="detail-subcategory"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {Object.entries(schema.subcategories).map(([v, opt]) => (
              <SelectItem key={v} value={v}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {fields.filter((f) => fieldVisible(f, details)).map((f) => (
        <div key={f.name}>
          <Label className="overline">{f.label}{f.required && <span className="text-red-600 ml-0.5">*</span>}</Label>
          <FieldRenderer field={f} value={details[f.name]} onChange={(v) => set(f.name, v)} />
        </div>
      ))}
    </div>
  );
}

// Helper: nice display for a job's details payload
export function ServiceDetailsView({ category, details }) {
  const schema = SERVICE_SCHEMAS[category];
  if (!schema || !details || Object.keys(details).length === 0) return null;
  const sub = details.subcategory && schema.subcategories?.[details.subcategory];
  const allFields = [...(schema.baseFields || []), ...(sub?.fields || [])];
  const lookup = (field, val) => {
    if (!field?.options) return Array.isArray(val) ? val.join(", ") : val;
    if (Array.isArray(val)) {
      return val.map((v) => field.options.find((o) => o.value === v)?.label || v).join(", ");
    }
    return field.options.find((o) => o.value === val)?.label || val;
  };
  return (
    <div className="space-y-2 text-sm" data-testid="service-details-view">
      {sub && (
        <div className="flex gap-3">
          <span className="overline text-slate-500 min-w-[140px]">{schema.subcategoryLabel}</span>
          <span className="font-mono">{sub.label}</span>
        </div>
      )}
      {allFields.map((f) => {
        const v = details[f.name];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
        return (
          <div key={f.name} className="flex gap-3">
            <span className="overline text-slate-500 min-w-[140px]">{f.label}</span>
            <span className="font-mono">{lookup(f, v)}</span>
          </div>
        );
      })}
    </div>
  );
}
