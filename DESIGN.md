# MLI — Design System v5 — "Corporate Intelligence Dashboard"

**Direction** : Dashboard analytics corporate, bleu royal dominant, clean et professionnel.
Dense en data, inspiré des outils premium de business intelligence.
LIGHT MODE uniquement. L'utilisateur doit se dire "c'est un outil pro sérieux".

## Palette

### Fonds & surfaces
| Token | Hex | Usage |
|-------|-----|-------|
| bg-page | `#EEF2FF` | Fond global (gris-bleu très léger) |
| bg-card | `#FFFFFF` | Cards blanches |
| bg-card-hover | `#F8FAFF` | Hover sur cards |
| bg-sidebar | `#1E2A4A` | Sidebar bleu nuit profond |
| bg-sidebar-active | `#2A3A5C` | Item actif sidebar |
| bg-input | `#F8FAFC` | Inputs sur fond gris clair |
| bg-header | `linear-gradient(135deg, #1E3A8A, #2563EB)` | Header bleu gradient |

### Accent principal (bleu royal)
| Token | Hex | Usage |
|-------|-----|-------|
| blue-700 | `#1D4ED8` | Accent principal, CTA, liens |
| blue-600 | `#2563EB` | Boutons, hover |
| blue-500 | `#3B82F6` | Charts, barres, indicateurs |
| blue-400 | `#60A5FA` | Éléments secondaires |
| blue-100 | `#DBEAFE` | Badge bg bleu |
| blue-50 | `#EFF6FF` | Hover subtil, backgrounds accent |

### Status
| Token | Hex | Usage |
|-------|-----|-------|
| green-500 | `#22C55E` | Succès, sites sains |
| green-100 | `#DCFCE7` | Badge bg vert |
| red-500 | `#EF4444` | Danger, sites morts |
| red-100 | `#FEE2E2` | Badge bg rouge |
| orange-500 | `#F97316` | Warning, MFA |
| orange-100 | `#FFEDD5` | Badge bg orange |
| indigo-500 | `#6366F1` | Info, flagged |
| indigo-100 | `#E0E7FF` | Badge bg indigo |

### Texte
| Token | Hex | Usage |
|-------|-----|-------|
| text-primary | `#0F172A` | Titres, noir quasi-pur |
| text-secondary | `#475569` | Body text |
| text-tertiary | `#94A3B8` | Labels, hints |
| text-sidebar | `#CBD5E1` | Texte sidebar clair |
| text-sidebar-active | `#FFFFFF` | Texte actif sidebar |

### Bordures
| Token | Valeur | Usage |
|-------|--------|-------|
| border-default | `#E2E8F0` | Bordure standard |
| border-light | `#F1F5F9` | Séparateurs subtils |

### Zones d'attention (charts)
| Zone | Hex |
|------|-----|
| ATF | `#EF4444` |
| Mid | `#F97316` |
| Deep | `#EAB308` |
| Footer | `#CBD5E1` |
| Sticky | `#8B5CF6` |

## Typographie

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Usage | Font | Poids | Taille |
|-------|------|-------|--------|
| Titre hero | **Plus Jakarta Sans** | 800 | 36-48px, tracking-tight |
| Sous-titres | **Plus Jakarta Sans** | 600 | 18-20px |
| Body | **Plus Jakarta Sans** | 400-500 | 14px |
| Chiffres KPI | **Plus Jakarta Sans** | 800 | 36-42px |
| Labels KPI | **Plus Jakarta Sans** | 500 | 11px uppercase, letter-spacing 1.5px, color #94A3B8 |
| Badges / code | **JetBrains Mono** | 500 | 11px |
| Logs journal | **JetBrains Mono** | 400 | 12px |

**IMPORTANT** : Ne PAS appliquer font-family sur div, span ou éléments
pouvant porter des icon fonts Material. Cibler uniquement p, h1-h6,
label, li, td, th.

PAS d'Inter, PAS de Roboto, PAS d'Arial.

## Composants

### Cards
```css
.mli-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    transition: box-shadow 0.2s ease;
}
.mli-card:hover {
    box-shadow: 0 4px 12px rgba(30,58,138,0.08);
}
```

### KPI Cards
```css
.kpi-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 20px 24px;
}
.kpi-value {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 36px;
    font-weight: 800;
    color: #0F172A;
}
.kpi-label {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #94A3B8;
}
.kpi-delta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #94A3B8;
}
.kpi-delta.positive { color: #22C55E; }
.kpi-delta.negative { color: #EF4444; }
```

### Badges
```css
.badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
}
.badge-ok { background: #DCFCE7; color: #16A34A; }
.badge-dead { background: #FEE2E2; color: #DC2626; }
.badge-mfa { background: #FFEDD5; color: #EA580C; }
.badge-flag { background: #E0E7FF; color: #4F46E5; }
.badge-present { background: #DBEAFE; color: #1D4ED8; }
.badge-absent { background: #F1F5F9; color: #94A3B8; }
```

### Bouton CTA
```css
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #1D4ED8, #2563EB);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 14px 28px;
    font-weight: 700;
    box-shadow: 0 4px 14px rgba(37,99,235,0.25);
    transition: all 0.15s ease;
}
.stButton > button[kind="primary"]:hover {
    box-shadow: 0 6px 20px rgba(37,99,235,0.35);
}
.stButton > button[kind="primary"]:active {
    transform: scale(0.98);
}
```

### Sidebar
```css
[data-testid="stSidebar"] {
    background: #1E2A4A;
    width: 260px;
}
/* Item actif : bg #2A3A5C, texte blanc, barre latérale bleue 3px */
/* Item inactif : texte #94A3B8 */
/* Logo MLI : Plus Jakarta Sans 800, blanc, le "I" en #60A5FA */
/* Séparateurs : rgba(255,255,255,0.08) */
```

### Tabs
```css
/* Container tabs : bg #F1F5F9, border-radius 12px, padding 4px */
/* Tab active : bg #FFFFFF avec shadow subtile, texte #1D4ED8 */
/* Tab inactive : transparent, texte #64748B */
```

### Inputs
```css
input, textarea {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
}
input:focus, textarea:focus {
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
}
```

## Charts Plotly

```python
PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Plus Jakarta Sans, sans-serif", color="#64748B", size=12),
    margin=dict(t=20, b=20, l=20, r=20),
)
PLOTLY_AXIS = dict(
    showgrid=True,
    gridcolor="#F1F5F9",
    zeroline=False,
    tickfont=dict(color="#64748B"),
)
```

Couleurs charts :
- Principal : #3B82F6 (bleu)
- Secondaire : #60A5FA (bleu clair)
- Donut : bleu (#3B82F6), vert (#22C55E), orange (#F97316), rouge (#EF4444)
- Stacked bars attention : ATF #EF4444, Mid #F97316, Deep #EAB308, Footer #CBD5E1, Sticky #8B5CF6

## Ce qu'il NE FAUT PAS faire

- Dark mode
- font-family sur div, span, ou éléments icon font
- Bordures > 1px
- Box-shadow opaques (toujours rgba)
- Inter, Roboto, Arial — utiliser Plus Jakarta Sans
- Streamlit brut sans override
