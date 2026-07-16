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
  return (
    <div className="section">
      <div className="section-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="flex-row" style={{ marginLeft: "auto", marginRight: 4 }}>
          {badge !== undefined && <span className="badge">{badge}</span>}
          <span className="text-muted-sm">
            {open ? "▲" : "▼"}
          </span>
        </span>
      </div>
      <div className={`section-body${open ? "" : " collapsed"}`}>
        {children}
      </div>
    </div>
  );
}
