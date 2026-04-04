# MLI — Design System v4 — "Dark Terminal Intelligence"

**Direction** : Bloomberg Terminal × Sequence.io × Linear.app
Dashboard data ad-tech premium. Audience = traders programmatiques.
DARK MODE uniquement. Densité d'information élevée mais aérée.

## Palette

### Fonds (du plus profond au plus élevé)
| Token | Hex | Usage |
|-------|-----|-------|
| bg-deepest | `#090e17` | Inputs, textarea, code blocks, scrollbar track |
| bg-app | `#0e141d` | Fond global, sidebar |
| bg-surface-low | `#161c25` | Cards, sidebar items actifs |
| bg-surface | `#1a2029` | Cards secondaires |
| bg-surface-high | `#252a34` | Headers de tableau, hover |

### Texte
| Token | Hex |
|-------|-----|
| text-bright | `#dee2f0` | Titres, chiffres KPI |
| text-muted | `#94a3b8` | Body, descriptions |
| text-dim | `#64748b` | Labels, hints, désactivé |

### Accents
| Token | Hex | Usage |
|-------|-----|-------|
| accent | `#4edea3` | Accent principal, CTA, succès |
| accent-alt | `#10B981` | Accent secondaire, charts |
| accent-glow | `rgba(78,222,163,0.15)` | Box-shadow CTA, glow cards |
| red | `#EF4444` | Danger, sites morts, ATF pubs |
| orange | `#F97316` | Warning, MFA |
| indigo | `#818CF8` | Info, flagged |
| amber | `#EAB308` | Attention moyenne |
| violet | `#7C3AED` | Sticky pubs |

### Bordures
| Token | Valeur |
|-------|--------|
| border | `rgba(60,74,66,0.15)` | Ultra subtile |
| border-hover | `rgba(255,255,255,0.05)` | border-top cards |

### Zones d'attention (charts)
| Zone | Hex |
|------|-----|
| ATF | `#EF4444` |
| Mid | `#F97316` |
| Deep | `#EAB308` |
| Footer | `#475569` |
| Sticky | `#7C3AED` |

## Typographie

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Usage | Font | Poids | Taille |
|-------|------|-------|--------|
| Titre hero | **Inter** | 800 | 36-48px, tracking-tight |
| Titres sections | **Inter** | 600 | 18-20px |
| Body | **Inter** | 400 | 14px |
| Labels KPI | **JetBrains Mono** uppercase | 500 | 10px, letter-spacing: 2px |
| Chiffres KPI | **Inter** | 700 | 36px |
| Badges / code | **JetBrains Mono** | 500 | 11px |
| Logs journal | **JetBrains Mono** | 400 | 12px |

**IMPORTANT** : Ne PAS appliquer font-family sur div, span ou éléments 
pouvant porter des icon fonts Material. Cibler uniquement p, h1-h6, 
label, li, td, th.

## Composants

### Status pill animé
```css
.status-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 9999px;
    background: rgba(78,222,163,0.1);
    border: 1px solid rgba(78,222,163,0.2);
    font-family: 'JetBrains Mono'; font-size: 11px; color: #4edea3;
}
.status-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #4edea3;
    animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
}
```

### Bouton CTA
```css
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #4edea3, #10B981);
    color: #090e17;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 2px;
    border: none;
    border-radius: 10px;
    padding: 14px 28px;
    box-shadow: 0 4px 20px rgba(78,222,163,0.15);
    transition: all 0.15s ease;
}
.stButton > button[kind="primary"]:hover {
    box-shadow: 0 6px 28px rgba(78,222,163,0.25);
}
.stButton > button[kind="primary"]:active {
    transform: scale(0.98);
}
```

### Cards
```css
.mli-card {
    background: #161c25;
    border: 1px solid rgba(60,74,66,0.15);
    border-top: 1px solid rgba(255,255,255,0.05);
    border-radius: 12px;
    padding: 20px 24px;
}
```

### Textarea / Inputs
```css
background: #090e17;
border: none;
font-family: 'JetBrains Mono';
color: rgba(78,222,163,0.7);
caret-color: #4edea3;
```

### Custom scrollbar
```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #090e17; }
::-webkit-scrollbar-thumb { background: #3c4a42; border-radius: 2px; }
```

## Charts Plotly

```python
PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Inter, sans-serif", color="#94a3b8", size=12),
    margin=dict(t=20, b=20, l=20, r=20),
)
PLOTLY_AXIS = dict(
    showgrid=True,
    gridcolor="rgba(60,74,66,0.15)",
    zeroline=False,
    tickfont=dict(color="#64748b"),
)
```

## Ce qu'il NE FAUT PAS faire

- Light mode
- font-family sur div, span, ou éléments icon font
- Bordures > 1px
- Box-shadow opaques (toujours rgba)
- Couleurs saturées en aplat (toujours transparence pour les badges)
- Streamlit brut sans override
