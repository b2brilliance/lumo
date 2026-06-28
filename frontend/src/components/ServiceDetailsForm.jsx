import React, { useEffect, useMemo } from "react";
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
  if (field.type === "textarea") {
    return (
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
        data-testid={`detail-${field.name}`}
      />
    );
  }
  if (field.type === "datetime-local") {
    return (
      <Input
        type="datetime-local"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
        data-testid={`detail-${field.name}`}
      />
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

  // Auto-select the single subcategory option when a schema only exposes
  // one — e.g. the "Other" catch-all category — so the universal
  // describe-what-you-need textarea appears without a redundant click.
  useEffect(() => {
    if (!schema || details.subcategory) return;
    const subs = Object.keys(schema.subcategories || {});
    if (subs.length === 1) {
      onChange({ ...details, subcategory: subs[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, schema]);

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

      {/* Universal "Other → describe what you need" — kicks in whenever the
          picked subcategory is the literal value "other". Every schema that
          exposes an Other subcategory gets a free-text textarea automatically
          (mechanic / notary / handyman / events / etc.). */}
      {details.subcategory === "other" && (
        <div data-testid="detail-other-wrap">
          <Label className="overline">Describe what you need <span className="text-red-600 ml-0.5">*</span></Label>
          <textarea
            value={details.other_description || ""}
            onChange={(e) => set("other_description", e.target.value)}
            placeholder="Tell the provider exactly what you need help with…"
            rows={3}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            data-testid="detail-other-description"
          />
        </div>
      )}
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
      {details.subcategory === "other" && details.other_description && (
        <div className="flex gap-3">
          <span className="overline text-slate-500 min-w-[140px]">What&apos;s needed</span>
          <span className="font-mono whitespace-pre-wrap">{details.other_description}</span>
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
