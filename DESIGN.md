# MLI — Design System v6 — "Command" Dark Dashboard

**Direction** : Command-style SaaS dashboard. Glassmorphism surfaces, fluid gradient accents,
ultra-thin typography. DARK MODE uniquement. The user must feel "this is a precision instrument".

---

## Color Tokens

### Surface Hierarchy

| Token             | Value       | Usage                            |
|-------------------|-------------|----------------------------------|
| `--surface-0`     | `#000000`   | Deepest background (modals)      |
| `--surface-1`     | `#080808`   | Page background (default)        |
| `--surface-2`     | `#0d0d0d`   | Recessed areas, sidebar bg       |
| `--surface-3`     | `#121212`   | Card base (solid fallback)       |
| `--surface-4`     | `#181818`   | Elevated cards, dropdowns        |
| `--surface-5`     | `#1c1c1c`   | Highest elevation, tooltips      |

### Glass Surface

```css
.glass {
    background: rgba(18, 18, 18, 0.4);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
}
```

### Accent Colors

| Token               | Value       | Usage                                     |
|----------------------|-------------|-------------------------------------------|
| `--color-primary`    | `#0066FF`   | Electric blue — buttons, links, focus      |
| `--color-accent`     | `#00E5FF`   | Vibrant cyan — highlights, active states   |
| `--color-success`    | `#00FC40`   | Neon green — success, positive deltas      |
| `--color-error`      | `#FF716C`   | Soft red — errors, dead sites              |
| `--color-warning`    | `#F59E0B`   | Amber — warnings, MFA flags               |

### Fluid Gradient

```css
:root {
    --gradient-fluid: linear-gradient(135deg, #0066FF, #00E5FF, #00FC40);
}
```

Used for: progress bar fills, active indicator lines, hero accents, button highlights.

### Text

| Token               | Value                       | Usage                        |
|----------------------|-----------------------------|------------------------------|
| `--text-primary`     | `#FFFFFF`                   | Headlines, primary content   |
| `--text-muted`       | `rgba(255, 255, 255, 0.56)` | Body text, descriptions      |
| `--text-hint`        | `#909090`                   | Placeholders, disabled       |
| `--text-label`       | `rgba(255, 255, 255, 0.40)` | Uppercase labels             |

### Outline & Borders

| Token                | Value       | Usage                       |
|----------------------|-------------|-----------------------------|
| `--outline`          | `#404040`   | Default borders             |
| `--outline-variant`  | `#2a2a2a`   | Subtle dividers             |
| `--outline-glass`    | `rgba(255, 255, 255, 0.05)` | Glass card borders |

### Attention Zones (charts)

| Zone   | Hex       |
|--------|-----------|
| ATF    | `#FF716C` |
| Mid    | `#F59E0B` |
| Deep   | `#00E5FF` |
| Footer | `#404040` |
| Sticky | `#A855F6` |

---

## CSS Custom Properties

```css
:root {
    /* Surfaces */
    --surface-0: #000000;
    --surface-1: #080808;
    --surface-2: #0d0d0d;
    --surface-3: #121212;
    --surface-4: #181818;
    --surface-5: #1c1c1c;

    /* Accent */
    --color-primary: #0066FF;
    --color-accent: #00E5FF;
    --color-success: #00FC40;
    --color-error: #FF716C;
    --color-warning: #F59E0B;

    /* Gradient */
    --gradient-fluid: linear-gradient(135deg, #0066FF, #00E5FF, #00FC40);

    /* Text */
    --text-primary: #FFFFFF;
    --text-muted: rgba(255, 255, 255, 0.56);
    --text-hint: #909090;
    --text-label: rgba(255, 255, 255, 0.40);

    /* Outline */
    --outline: #404040;
    --outline-variant: #2a2a2a;
    --outline-glass: rgba(255, 255, 255, 0.05);

    /* Glass */
    --glass-bg: rgba(18, 18, 18, 0.4);
    --glass-blur: 24px;
    --glass-border: rgba(255, 255, 255, 0.05);

    /* Glow */
    --glow-blue: 0 10px 40px -15px rgba(0, 102, 255, 0.2);
    --glow-cyan: 0 10px 40px -15px rgba(0, 229, 255, 0.2);
    --glow-green: 0 10px 40px -15px rgba(0, 252, 64, 0.2);
    --glow-error: 0 10px 40px -15px rgba(255, 113, 108, 0.2);

    /* Radius */
    --radius-card: 16px;
    --radius-button: 12px;
    --radius-badge: 9999px;
    --radius-input: 10px;

    /* Font */
    --font-display: 'Manrope', sans-serif;
    --font-mono: 'Inter', sans-serif;
}
```

---

## Typography

### Font Loading

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@100;200;300;400;500;600;700&family=Inter:wght@100;200;300;400;500;600&display=swap" rel="stylesheet">
```

### Scale

| Usage             | Font         | Weight  | Size       | Extras                                       |
|-------------------|--------------|---------|------------|----------------------------------------------|
| Hero title        | **Manrope**  | 200     | 40-48px    | `letter-spacing: -0.02em`                    |
| Section heading   | **Manrope**  | 200     | 20-24px    | `letter-spacing: -0.01em`                    |
| Body              | **Manrope**  | 200     | 14px       | `line-height: 1.6`                           |
| Big KPI numbers   | **Manrope**  | 100     | 42-56px    | `letter-spacing: -0.03em`, text-shadow glow  |
| Labels            | **Inter**    | 200     | 9-10px     | `text-transform: uppercase; letter-spacing: 0.2-0.3em` |
| Data / mono       | **Inter**    | 300     | 12-13px    | Tabular nums, domain names, code             |
| Emphasis text     | **Manrope**  | 600-700 | inherit    | Only for strong emphasis, CTA text            |
| Log entries       | **Inter**    | 300     | 12px       | `font-feature-settings: 'tnum'`             |

### Weight Philosophy

Ultra-thin is the default (100-200). Reserve 600-700 exclusively for:
- CTA button text
- Active nav items
- Critical status text (error counts)
- Column headers in tables

Everything else stays feather-light.

### Big Numbers with Glow

```css
.kpi-value {
    font-family: var(--font-display);
    font-size: 48px;
    font-weight: 100;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    text-shadow: 0 0 40px rgba(0, 102, 255, 0.3);
}
```

---

## Components

### Glass Card

```css
.card {
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-card);
    padding: 24px;
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

.card:hover {
    border-color: rgba(255, 255, 255, 0.08);
}

.card-glow-blue {
    box-shadow: var(--glow-blue);
}

.card-glow-cyan {
    box-shadow: var(--glow-cyan);
}

.card-glow-green {
    box-shadow: var(--glow-green);
}
```

### KPI Card

```css
.kpi-card {
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-card);
    padding: 24px 28px;
}

.kpi-value {
    font-family: var(--font-display);
    font-size: 48px;
    font-weight: 100;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    text-shadow: 0 0 40px rgba(0, 102, 255, 0.3);
}

.kpi-label {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 200;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: var(--text-label);
    margin-top: 8px;
}

.kpi-delta {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 300;
    color: var(--text-hint);
}
.kpi-delta.positive { color: var(--color-success); }
.kpi-delta.negative { color: var(--color-error); }
```

### Badges (text-only, no background)

```css
.badge {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 300;
    letter-spacing: 0.05em;
    padding: 0;
    background: none;
}
.badge-ok      { color: var(--color-success); }
.badge-dead    { color: var(--color-error); }
.badge-mfa     { color: var(--color-warning); }
.badge-flag    { color: var(--color-accent); }
.badge-present { color: var(--color-primary); }
.badge-absent  { color: var(--text-hint); }
```

### LIVE Indicator

```css
.live-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 300;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--color-accent);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 9999px;
    padding: 4px 12px;
}

.live-indicator::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: pulse-live 2s ease-in-out infinite;
}

@keyframes pulse-live {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0, 229, 255, 0.4); }
    50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(0, 229, 255, 0); }
}
```

### Progress Bar

```css
.progress-track {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 2px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: var(--gradient-fluid);
    border-radius: 2px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Buttons

```css
/* Primary CTA */
.btn-primary {
    background: var(--color-primary);
    color: #FFFFFF;
    border: none;
    border-radius: var(--radius-button);
    padding: 12px 24px;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(0, 102, 255, 0.25);
}

.btn-primary:hover {
    box-shadow: 0 6px 24px rgba(0, 102, 255, 0.35);
    transform: translateY(-1px);
}

.btn-primary:active {
    transform: scale(0.98) translateY(0);
}

/* Ghost / Secondary */
.btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--outline-variant);
    border-radius: var(--radius-button);
    padding: 12px 24px;
    font-family: var(--font-display);
    font-weight: 200;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-ghost:hover {
    border-color: var(--outline);
    color: var(--text-primary);
}
```

### Sidebar / Navigation

```css
.sidebar {
    background: var(--surface-2);
    border-right: 1px solid var(--outline-variant);
    width: 240px;
}

.nav-item {
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 200;
    color: var(--text-muted);
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.nav-item:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.03);
}

.nav-item.active {
    color: var(--text-primary);
    font-weight: 600;
    background: rgba(0, 102, 255, 0.08);
    border-left: 2px solid var(--color-primary);
}
```

### Tabs

```css
.tab-group {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--outline-variant);
}

.tab {
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 200;
    color: var(--text-muted);
    padding: 12px 20px;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
}

.tab:hover {
    color: var(--text-primary);
}

.tab.active {
    color: var(--text-primary);
    font-weight: 400;
    border-bottom-color: var(--color-primary);
}
```

### Inputs

```css
input, textarea {
    background: var(--surface-3);
    border: 1px solid var(--outline-variant);
    border-radius: var(--radius-input);
    color: var(--text-primary);
    font-family: var(--font-display);
    font-weight: 200;
    font-size: 14px;
    padding: 10px 14px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input::placeholder, textarea::placeholder {
    color: var(--text-hint);
    font-weight: 200;
}

input:focus, textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.12);
}
```

### Tables

```css
table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-display);
}

th {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 200;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--text-label);
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--outline-variant);
}

td {
    font-size: 13px;
    font-weight: 200;
    color: var(--text-muted);
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

tr:hover td {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.02);
}
```

### Dialogs / Modals

```css
.modal-overlay {
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
}

.modal {
    background: var(--surface-3);
    border: 1px solid var(--outline-variant);
    border-radius: var(--radius-card);
    padding: 32px;
    box-shadow: 0 24px 80px -16px rgba(0, 0, 0, 0.6);
    max-width: 640px;
}
```

---

## Charts (Recharts / Plotly)

```js
const CHART_THEME = {
    backgroundColor: 'transparent',
    textColor: 'rgba(255,255,255,0.40)',
    fontSize: 10,
    fontFamily: 'Inter, sans-serif',
    gridColor: 'rgba(255,255,255,0.04)',
    colors: {
        primary: '#0066FF',
        accent: '#00E5FF',
        success: '#00FC40',
        error: '#FF716C',
        warning: '#F59E0B',
    },
    attention: {
        atf: '#FF716C',
        mid: '#F59E0B',
        deep: '#00E5FF',
        footer: '#404040',
        sticky: '#A855F6',
    },
};
```

```python
# Plotly fallback
PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Inter, sans-serif", color="rgba(255,255,255,0.40)", size=10),
    margin=dict(t=20, b=20, l=20, r=20),
)
PLOTLY_AXIS = dict(
    showgrid=True,
    gridcolor="rgba(255,255,255,0.04)",
    zeroline=False,
    tickfont=dict(color="rgba(255,255,255,0.40)"),
)
```

---

## Tailwind CSS Mapping

For Next.js + Tailwind, extend `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
    theme: {
        extend: {
            colors: {
                surface: {
                    0: '#000000',
                    1: '#080808',
                    2: '#0d0d0d',
                    3: '#121212',
                    4: '#181818',
                    5: '#1c1c1c',
                },
                primary: '#0066FF',
                accent: '#00E5FF',
                success: '#00FC40',
                error: '#FF716C',
                warning: '#F59E0B',
                muted: 'rgba(255, 255, 255, 0.56)',
                hint: '#909090',
                label: 'rgba(255, 255, 255, 0.40)',
                outline: {
                    DEFAULT: '#404040',
                    variant: '#2a2a2a',
                    glass: 'rgba(255, 255, 255, 0.05)',
                },
            },
            fontFamily: {
                display: ['Manrope', 'sans-serif'],
                mono: ['Inter', 'sans-serif'],
            },
            backgroundImage: {
                'gradient-fluid': 'linear-gradient(135deg, #0066FF, #00E5FF, #00FC40)',
            },
            borderRadius: {
                card: '16px',
            },
            boxShadow: {
                'glow-blue': '0 10px 40px -15px rgba(0, 102, 255, 0.2)',
                'glow-cyan': '0 10px 40px -15px rgba(0, 229, 255, 0.2)',
                'glow-green': '0 10px 40px -15px rgba(0, 252, 64, 0.2)',
                'glow-error': '0 10px 40px -15px rgba(255, 113, 108, 0.2)',
            },
            letterSpacing: {
                label: '0.25em',
            },
        },
    },
    plugins: [],
};

export default config;
```

### Utility Classes Reference

| Class                        | Purpose                                |
|------------------------------|----------------------------------------|
| `bg-surface-1`               | Page background                        |
| `bg-surface-3`               | Card fallback (non-glass)              |
| `text-muted`                 | Secondary text                         |
| `text-hint`                  | Tertiary text                          |
| `font-display`               | Manrope                                |
| `font-mono`                  | Inter (labels, data)                   |
| `font-thin` (100)            | Default text weight                    |
| `font-extralight` (200)      | Labels, body                           |
| `font-semibold` (600)        | Emphasis only                          |
| `bg-gradient-fluid`          | Gradient fill                          |
| `shadow-glow-blue`           | Blue glow on cards                     |
| `shadow-glow-cyan`           | Cyan glow on cards                     |
| `border-outline-variant`     | Subtle borders                         |
| `border-outline-glass`       | Glass card borders                     |
| `rounded-card`               | 16px radius                            |
| `tracking-label`             | 0.25em letter-spacing for labels       |

### Glass Card with Tailwind

```html
<div class="bg-[rgba(18,18,18,0.4)] backdrop-blur-[24px] border border-outline-glass rounded-card p-6 shadow-glow-blue">
    <!-- content -->
</div>
```

---

## Do / Do Not

### DO
- Use `font-thin` (100) or `font-extralight` (200) for almost everything
- Apply `backdrop-blur-[24px]` on card surfaces
- Use `var(--gradient-fluid)` for progress bars, active states, accent lines
- Keep borders at `1px solid rgba(255,255,255,0.05)`
- Use colored text-shadow glow on big numbers
- Keep labels 9-10px, uppercase, wide letter-spacing
- Use text-only badges (colored text, no background fill)
- Use 3px thin progress bars

### DO NOT
- Use light mode or light backgrounds
- Apply font-weight > 300 to regular text
- Use opaque backgrounds on cards (always glass or near-transparent)
- Use solid-fill badges (always text-only)
- Use borders > 1px
- Use rounded corners < 12px on cards (always 16px)
- Use any font other than Manrope and Inter
- Apply font-family on `div`, `span`, or icon-font containers
