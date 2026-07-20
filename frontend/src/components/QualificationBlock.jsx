import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, X, CheckCircle2, FileText, Loader2 } from "lucide-react";

/* QualificationBlock — dynamic questionnaire + document uploader for ONE
 * provider category. Reads the schema from providerQualifications.js and
 * renders each field type (text / number / select / radio / checkbox /
 * textarea) plus a document uploader for each required or optional doc.
 *
 * Props:
 *   category        the category schema descriptor (label, key, schema)
 *   value           { answers: {}, documents: {} }
 *   onChange(v)     replaces the full value
 *
 * All doc uploads hit the public /api/media/upload-provider-doc endpoint
 * so applicants don't need a JWT yet.
 */
export default function QualificationBlock({ category, value, onChange }) {
  const { key: catKey, label: catLabel, schema } = category;
  if (!schema) return null;
  const answers = value?.answers || {};
  const documents = value?.documents || {};

  const setAnswer = (k, v) => onChange({ answers: { ...answers, [k]: v }, documents });
  const setDoc = (k, v) => onChange({ answers, documents: { ...documents, [k]: v } });

  return (
    <div className="border border-slate-200 bg-slate-50/40 p-4 sm:p-5" data-testid={`qual-block-${catKey}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest bg-teal-100 text-teal-800 px-1.5 py-0.5">Qualifications</span>
        <h4 className="font-display font-bold text-lg text-slate-900">{catLabel}</h4>
      </div>
      {schema.summary && <p className="text-xs text-slate-600 leading-relaxed mb-4">{schema.summary}</p>}

      {/* Fields */}
      <div className="space-y-4">
        {(schema.fields || []).map((f) => (
          <QualField key={f.key} field={f} value={answers[f.key]} onChange={(v) => setAnswer(f.key, v)} catKey={catKey} />
        ))}
      </div>

      {/* Documents */}
      {schema.documents && schema.documents.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-200">
          <div className="overline mb-3 text-slate-700">Upload documents</div>
          <p className="text-xs text-slate-500 mb-4">JPG / PNG / PDF. 8 MB max per file. We only share these with you and the Lumo verification team.</p>
          <div className="space-y-3">
            {schema.documents.map((d) => (
              <DocUpload
                key={d.key}
                doc={d}
                value={documents[d.key]}
                onChange={(v) => setDoc(d.key, v)}
                testId={`qual-doc-${catKey}-${d.key}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One field renderer for the schema field types. */
function QualField({ field, value, onChange, catKey }) {
  const testId = `qual-field-${catKey}-${field.key}`;
  const labelText = (
    <Label className="text-sm text-slate-800 flex items-center gap-1">
      {field.label}
      {field.required && <span className="text-red-600">*</span>}
    </Label>
  );

  switch (field.type) {
    case "text":
      return (
        <div>
          {labelText}
          <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1" data-testid={testId} />
          {field.help && <p className="text-[11px] text-slate-500 mt-1">{field.help}</p>}
        </div>
      );
    case "number":
      return (
        <div>
          {labelText}
          <Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1" data-testid={testId} />
          {field.help && <p className="text-[11px] text-slate-500 mt-1">{field.help}</p>}
        </div>
      );
    case "textarea":
      return (
        <div>
          {labelText}
          <Textarea rows={3} value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1" data-testid={testId} />
        </div>
      );
    case "select":
      return (
        <div>
          {labelText}
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className="mt-1" data-testid={testId}><SelectValue placeholder="Choose one…" /></SelectTrigger>
            <SelectContent>
              {(field.options || []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    case "radio":
      return (
        <div>
          {labelText}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {(field.options || []).map((o) => {
              const active = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(o.value)}
                  className={`text-xs border px-2.5 py-2 text-left transition-colors ${active ? "bg-teal-700 text-white border-teal-700" : "bg-white text-slate-800 border-slate-300 hover:border-slate-500"}`}
                  data-testid={`${testId}-${o.value}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "checkbox": {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (v) => {
        const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
        onChange(next);
      };
      return (
        <div>
          {labelText}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(field.options || []).map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={arr.includes(o.value)} onCheckedChange={() => toggle(o.value)} data-testid={`${testId}-${o.value}`} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Doc upload row — one per required/optional document. */
function DocUpload({ doc, value, onChange, testId }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/media/upload-provider-doc", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange({ media_url: data.media_url, media_type: data.media_type, id: data.id, filename: file.name });
      toast.success(`${doc.label} uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-slate-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            {doc.label}
            {doc.required && <span className="text-red-600">*</span>}
            {value && <CheckCircle2 className="w-4 h-4 text-teal-700" />}
          </div>
          {doc.help && <p className="text-[11px] text-slate-500 mt-0.5">{doc.help}</p>}
          {value?.filename && (
            <div className="mt-1 text-[11px] font-mono text-slate-500 flex items-center gap-1">
              <FileText className="w-3 h-3" /> {value.filename}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value ? (
            <>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => inputRef.current?.click()} data-testid={`${testId}-replace`}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Replace
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-red-600 hover:text-red-800 hover:bg-red-50" onClick={() => onChange(null)} data-testid={`${testId}-remove`}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" className="h-8 bg-slate-900 hover:bg-slate-800" onClick={() => inputRef.current?.click()} disabled={busy} data-testid={`${testId}-upload`}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              {busy ? "Uploading…" : "Upload"}
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }}
      />
    </div>
  );
}
