import React, { createContext, useContext, useMemo, useState } from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ==================== Card ====================
export function Card({ className = "", children }) {
  return <div className={cx("bg-white", className)}>{children}</div>;
}
export function CardHeader({ className = "", children }) {
  return <div className={cx("p-6 pb-4", className)}>{children}</div>;
}
export function CardTitle({ className = "", children }) {
  return <h2 className={cx("font-semibold text-slate-900", className)}>{children}</h2>;
}
export function CardDescription({ className = "", children }) {
  return <p className={cx("mt-1 text-sm text-slate-500", className)}>{children}</p>;
}
export function CardContent({ className = "", children }) {
  return <div className={cx("p-6 pt-0", className)}>{children}</div>;
}

// ==================== Button ====================
export function Button({ className = "", variant = "default", size, children, ...props }) {
  const variantClass =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      : variant === "secondary"
      ? "bg-slate-200 text-slate-900 hover:bg-slate-300"
      : variant === "ghost"
      ? "bg-transparent text-slate-700 hover:bg-slate-100"
      : "bg-slate-900 text-white hover:bg-slate-800";

  const sizeClass = size === "icon" ? "w-10 h-10 p-0" : "px-4 py-2";

  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 text-sm font-medium transition rounded-md",
        variantClass,
        sizeClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ==================== Input ====================
export function Input({ className = "", ...props }) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300",
        className
      )}
      {...props}
    />
  );
}

// ==================== Label ====================
export function Label({ className = "", children }) {
  return <label className={cx("text-sm font-medium text-slate-700", className)}>{children}</label>;
}

// ==================== Badge ====================
export function Badge({ className = "", variant = "default", children }) {
  const v =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-700"
      : variant === "secondary"
      ? "bg-slate-100 text-slate-700"
      : "bg-slate-900 text-white";

  return <span className={cx("inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full", v, className)}>{children}</span>;
}

// ==================== Select ====================
const SelectItemMarker = Symbol("SelectItem");

export function SelectItem(props) {
  return null;
}
SelectItem.$$type = SelectItemMarker;

function flattenItems(children, acc = []) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (child.type?.$$type === SelectItemMarker) {
      acc.push({ value: child.props.value, label: child.props.children });
      return;
    }

    if (child.props?.children) flattenItems(child.props.children, acc);
  });

  return acc;
}

export function Select({ value, onValueChange, children }) {
  const items = useMemo(() => flattenItems(children), [children]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onValueChange?.(e.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 h-11"
    >
      {items.map((item) => (
        <option key={String(item.value)} value={String(item.value)}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function SelectTrigger({ children }) {
  return children ?? null;
}
export function SelectValue() {
  return null;
}
export function SelectContent({ children }) {
  return children ?? null;
}

// ==================== Tabs ====================
const TabsContext = createContext(null);

export function Tabs({ defaultValue, className = "", children }) {
  const [active, setActive] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className = "", children }) {
  return <div className={cx("inline-flex gap-1", className)}>{children}</div>;
}

export function TabsTrigger({ value, className = "", children }) {
  const ctx = useContext(TabsContext);
  const active = ctx?.active === value;

  return (
    <button
      type="button"
      onClick={() => ctx?.setActive(value)}
      className={cx(
        "px-3 py-2 text-sm font-medium",
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className = "", children }) {
  const ctx = useContext(TabsContext);
  if (ctx?.active !== value) return null;
  return <div className={className}>{children}</div>;
}
