import React from "react";

export function TargetInput({ 
  value, 
  onChange, 
  onSubmit, 
  loading, 
  placeholder = "Enter target username (e.g. elonmusk)" 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  onSubmit: () => void; 
  loading: boolean; 
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2 mb-6">
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        spellCheck="false"
        autoCapitalize="none"
        className="flex-1 bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-violet/50 transition-all"
      />
      <button onClick={onSubmit} disabled={loading || !value.trim()}
        className="px-4 py-2.5 rounded-xl bg-accent-violet/20 text-accent-violet text-sm font-medium hover:bg-accent-violet/30 transition-colors border border-accent-violet/30 disabled:opacity-50">
        {loading ? "Loading..." : "Analyze"}
      </button>
    </div>
  );
}
