# Icon Design System & Styling Guide

This project uses **Lucide React** (`lucide-react`) paired with custom Tailwind CSS v4 design tokens and utilities.

---

## 1. Installation & Imports

```bash
npm install lucide-react
```

### Common Project Imports
```jsx
import {
  // Navigation & Shell
  LayoutDashboard, BedDouble, PartyPopper, Package, Wallet,
  Users, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, Menu, X,

  // Actions & Controls
  Plus, Pencil, Trash2, Search, KeyRound, LogOut, Save, Layers,

  // Status & Utility
  Zap, Crown, CalendarDays, LogIn, Wrench, Snowflake, LoaderCircle,
  CircleAlert, CircleCheck, TriangleAlert, Check, ChevronDown
} from 'lucide-react';
```

---

## 2. Icon Sizing Standards

| Context | Size Prop | Tailwind Height / Width | Usage in Application |
| :--- | :--- | :--- | :--- |
| **Small / Inline Actions** | `size={13}` or `size={14}` | `h-3.5 w-3.5` | Small buttons (`size="sm"`), table action links, badge pills |
| **Standard UI & Buttons** | `size={16}` or `size={17}` | `h-4 w-4` | Card header badges, default buttons (`size="md"`), form inputs |
| **Navigation & Layout** | `size={18}` or `size={19}` | `h-4.5 w-4.5` | Sidebar navigation items, sidebar collapse toggles |
| **Hero / Feature Badges** | `size={24}` | `h-6 w-6` | Banquet hall showcase cards, hero banners |

---

## 3. Signature Squircle Icon Containers

The application places icons inside rounded `grid` containers (squircles) matching the brand palette:

### Gold Accent Badge (Card Headers, Highlights)
```jsx
<div className="grid h-9 w-9 place-items-center rounded-xl bg-gold-50 text-gold-600">
  <Zap size={17} />
</div>
```

### Dark Luxury Navy Badge (Royal Suite, Primary Hall)
```jsx
<div className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-gold-300">
  <Crown size={16} />
</div>
```

### Emerald / Success Badge (Check-in, Paid)
```jsx
<div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
  <LogIn size={16} />
</div>
```

### Rose / Danger Badge (Departures, Dues, Delete)
```jsx
<div className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-600">
  <Trash2 size={16} />
</div>
```

### Sky Blue Badge (Standard AC Rooms)
```jsx
<div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-600">
  <Snowflake size={16} />
</div>
```

### Amber / Notice Badge (Pending Actions)
```jsx
<div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
  <LogOut size={16} />
</div>
```

---

## 4. Sidebar Navigation Interactive States

```jsx
// Active Link
<NavLink className="bg-white/10 text-white">
  {/* Active Indicator Bar on Left */}
  <span className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-gold-400" />
  <Icon size={19} className="text-gold-300 shrink-0" />
  <span>{label}</span>
</NavLink>

// Inactive Link (Hover state)
<NavLink className="text-ink-200 hover:bg-white/5 hover:text-white">
  <Icon size={19} className="text-ink-300 group-hover:text-gold-200 transition shrink-0" />
  <span>{label}</span>
</NavLink>
```

---

## 5. Button Icon Integration

In `src/components/ui.jsx`, button icons are automatically sized and styled:

```jsx
// Medium Button (Default)
<Button variant="gold" icon={Plus}>New booking</Button>
// Automatically renders <Plus size={16} />

// Small Button
<Button variant="outline" size="sm" icon={Layers}>Book Combo</Button>
// Automatically renders <Layers size={14} />

// Ghost / Icon-only Action Button
<Button
  variant="ghost"
  size="sm"
  icon={Trash2}
  className="text-red-500 hover:bg-red-50 hover:text-red-700 p-2"
  title="Delete"
/>

// Loading / Submitting State
<Button loading={saving}>Save changes</Button>
// Replaces icon with <LoaderCircle size={16} className="animate-spin" />
```

---

## 6. Table Actions & Inline Icons

```jsx
// Action Icon Button in Data Table Row
<button
  type="button"
  onClick={onEdit}
  title="Edit"
  className="cursor-pointer rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-ink-900"
>
  <Pencil size={16} />
</button>
```
