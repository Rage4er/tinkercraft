import { useState } from "react";

// ---- Collapsible section ----
export default function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = `section-${title.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="section">
      <div
        className="section-title"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o)
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={sectionId}
      >
        <span>{title}</span>
        <span className="flex-row" style={{ marginLeft: "auto", marginRight: 4 }}>
          {badge !== undefined && <span className="badge">{badge}</span>}
          <span className="text-muted-sm">
            {open ? "▲" : "▼"}
          </span>
        </span>
      </div>
      <div id={sectionId} className={`section-body${open ? "" : " collapsed"}`}>
        {children}
      </div>
    </div>
  );
}
