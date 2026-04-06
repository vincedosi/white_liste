"""
MLI — Media-List Intelligence
Application Streamlit — Corporate Intelligence Dashboard
"""
from __future__ import annotations
import asyncio
import io
import json
import os
import time
import zipfile
from datetime import datetime
from pathlib import Path

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from models import SiteAudit, AuditReport, SiteStatus, CleanAction, HealthResult, AttentionResult
from health_checker import check_all
from pw_bridge import score_all_subprocess, extract_metadata_subprocess, screenshot_all_subprocess
from categorizer import categorize_all
from mistral_validator import validate_mistral_key
from geo_locator import localize_all, LocalizationResult, COUNTRY_COORDS, TLD_COUNTRY_MAP
from ads_txt_checker import check_all_ads_txt
from config import TAXONOMY, MFA_THRESHOLD


# ── Plotly defaults (DESIGN.md v5 — Corporate Intelligence) ───────
PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Plus Jakarta Sans, sans-serif", color="#64748B", size=12),
)
PLOTLY_AXIS = dict(
    showgrid=True,
    gridcolor="#F1F5F9",
    zeroline=False,
    tickfont=dict(color="#64748B"),
)

# Ad-tech display names
ADTECH_DISPLAY = {
    "gpt": "GPT",
    "prebid": "Prebid",
    "amazon_tam": "Amazon",
    "criteo": "Criteo",
    "teads": "Teads",
    "taboola": "Taboola",
    "outbrain": "Outbrain",
    "smart": "Smart",
    "pubmatic": "PubMatic",
    "appnexus": "AppNexus",
    "magnite": "Magnite",
    "index": "Index",
}


# ── Page Config ──────────────────────────────────────────
st.set_page_config(
    page_title="MLI — Media-List Intelligence",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── CSS Light Mode (DESIGN.md v5 — Corporate Intelligence) ────
st.markdown("""
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * MLI — Corporate Intelligence Dashboard
     * Light mode, bleu royal dominant, clean, pro
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    /* ── Global backgrounds ─────────────────────────── */
    .stApp,
    .stApp [data-testid="stAppViewContainer"],
    .stApp [data-testid="stHeader"],
    .main .block-container {
        background-color: #EEF2FF !important;
    }

    /* ── Typography — TEXT elements only ─────────────
     * NEVER touch div, span, [data-testid], icon fonts */
    .stApp p,
    .stApp h1, .stApp h2, .stApp h3, .stApp h4, .stApp h5, .stApp h6,
    .stApp li,
    .stApp label,
    .stApp .stMarkdown p,
    .stApp .stMarkdown li,
    .stApp caption,
    .stApp td, .stApp th {
        color: #0F172A !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
    }

    /* ── Custom scrollbar ───────────────────────────── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #F1F5F9; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

    /* ── Status pill animation ───────────────────────── */
    @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.8); }
    }
    .status-pill {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 14px; border-radius: 9999px;
        background: #DBEAFE;
        border: 1px solid #BFDBFE;
        font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #1D4ED8;
    }
    .status-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #3B82F6;
        animation: pulse-dot 2s ease-in-out infinite;
    }

    /* ── Sidebar ────────────────────────────────────── */
    [data-testid="stSidebar"],
    [data-testid="stSidebar"] > div {
        background-color: #1E2A4A !important;
        border-right: 1px solid rgba(255,255,255,0.08) !important;
        box-shadow: 2px 0 12px rgba(30,42,74,0.15) !important;
    }
    [data-testid="stSidebar"] .stMarkdown h3,
    [data-testid="stSidebar"] .stMarkdown h5 {
        font-weight: 600 !important;
        font-size: 13px !important;
        color: #CBD5E1 !important;
    }
    [data-testid="stSidebar"] p,
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] .stMarkdown p {
        color: #CBD5E1 !important;
        font-size: 13px !important;
    }
    [data-testid="stSidebar"] .stCaption, [data-testid="stSidebar"] .stCaption p {
        color: #94A3B8 !important;
    }
    [data-testid="stSidebar"] hr {
        border-color: rgba(255,255,255,0.08) !important;
    }

    /* Sidebar inputs */
    [data-testid="stSidebar"] .stTextInput input,
    [data-testid="stSidebar"] .stTextInput input[type="text"],
    [data-testid="stSidebar"] .stTextInput input[type="password"] {
        background-color: #2A3A5C !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        color: #FFFFFF !important;
        border-radius: 10px !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 13px !important;
        caret-color: #60A5FA !important;
    }
    [data-testid="stSidebar"] .stTextInput input:focus,
    [data-testid="stSidebar"] .stTextInput input[type="password"]:focus {
        border-color: #60A5FA !important;
        box-shadow: 0 0 0 2px rgba(96,165,250,0.2) !important;
    }
    [data-testid="stSidebar"] .stCheckbox label,
    [data-testid="stSidebar"] .stCheckbox label p {
        color: #CBD5E1 !important;
    }
    [data-testid="stSidebar"] .stSelectbox [data-baseweb="select"] > div {
        background-color: #2A3A5C !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        color: #FFFFFF !important;
        border-radius: 10px !important;
    }
    [data-testid="stSidebar"] .stSelectbox [data-baseweb="select"] span {
        color: #FFFFFF !important;
    }
    [data-testid="stSidebar"] .stButton > button:not([kind="primary"]) {
        background-color: #2A3A5C !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        color: #CBD5E1 !important;
    }
    [data-testid="stSidebar"] .stButton > button:not([kind="primary"]):hover {
        border-color: #60A5FA !important;
        color: #FFFFFF !important;
    }
    [data-testid="stSidebar"] .stSlider label p { color: #CBD5E1 !important; }
    [data-testid="stSidebar"] .stSlider [data-baseweb="slider"] div[role="slider"] { background-color: #3B82F6 !important; }

    /* Sidebar file uploader */
    [data-testid="stSidebar"] [data-testid="stFileUploader"] { background-color: transparent !important; }
    [data-testid="stSidebar"] [data-testid="stFileUploader"] section {
        background-color: #2A3A5C !important;
        border: 1px dashed rgba(255,255,255,0.15) !important;
        border-radius: 10px !important;
    }
    [data-testid="stSidebar"] [data-testid="stFileUploader"] section > div { color: #94A3B8 !important; }
    [data-testid="stSidebar"] [data-testid="stFileUploader"] button {
        background-color: #1E2A4A !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        color: #CBD5E1 !important;
    }
    [data-testid="stSidebar"] details[data-testid="stExpander"] {
        background-color: #2A3A5C !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
    }
    [data-testid="stSidebar"] details[data-testid="stExpander"] summary {
        color: #CBD5E1 !important;
    }
    [data-testid="stSidebar"] details[data-testid="stExpander"] > div {
        background-color: #2A3A5C !important;
    }

    /* ── ALL Inputs (main area) ─────────────────────── */
    .stTextInput input,
    .stTextInput input[type="text"],
    .stTextInput input[type="password"],
    .stTextArea textarea,
    .stSelectbox > div > div,
    .stSelectbox [data-baseweb="select"] > div,
    .stNumberInput input {
        background-color: #F8FAFC !important;
        border: 1px solid #E2E8F0 !important;
        color: #0F172A !important;
        border-radius: 10px !important;
        font-size: 13px !important;
        caret-color: #3B82F6 !important;
    }
    .stTextArea textarea {
        color: #475569 !important;
        font-family: 'JetBrains Mono', monospace !important;
    }
    .stTextInput input:focus,
    .stTextInput input[type="password"]:focus,
    .stTextArea textarea:focus {
        border-color: #3B82F6 !important;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important;
    }
    /* Selectbox dropdown */
    [data-baseweb="popover"],
    [data-baseweb="menu"],
    [data-baseweb="popover"] ul,
    [data-baseweb="menu"] ul {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
    }
    [data-baseweb="menu"] li {
        color: #0F172A !important;
        background-color: transparent !important;
    }
    [data-baseweb="menu"] li:hover,
    [data-baseweb="menu"] li[aria-selected="true"] {
        background-color: #EFF6FF !important;
    }
    .stSelectbox [data-baseweb="select"] span {
        color: #0F172A !important;
    }

    /* ── Buttons — CTA (primary) ───────────────────── */
    .stButton > button[kind="primary"] {
        background: linear-gradient(135deg, #1D4ED8, #2563EB) !important;
        color: #FFFFFF !important;
        border: none !important;
        border-radius: 12px !important;
        font-weight: 700 !important;
        font-size: 13px !important;
        text-transform: uppercase !important;
        letter-spacing: 1.5px !important;
        padding: 14px 28px !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        box-shadow: 0 4px 14px rgba(37,99,235,0.25) !important;
        transition: all 0.15s ease !important;
    }
    .stButton > button[kind="primary"]:hover {
        box-shadow: 0 6px 20px rgba(37,99,235,0.35) !important;
    }
    .stButton > button[kind="primary"]:active {
        transform: scale(0.98) !important;
    }

    /* ── Buttons — secondary ───────────────────────── */
    .stButton > button:not([kind="primary"]):not([kind="tertiary"]) {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        color: #475569 !important;
        border-radius: 10px !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        transition: all 0.15s ease !important;
    }
    .stButton > button:not([kind="primary"]):not([kind="tertiary"]):hover {
        border-color: #3B82F6 !important;
        color: #1D4ED8 !important;
        box-shadow: 0 2px 8px rgba(59,130,246,0.1) !important;
    }

    /* ── Buttons — tertiary (link) ─────────────────── */
    .stButton > button[kind="tertiary"] {
        color: #1D4ED8 !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        padding: 2px 0 !important;
        background: transparent !important;
        border: none !important;
    }
    .stButton > button[kind="tertiary"]:hover {
        color: #2563EB !important;
        text-decoration: underline !important;
    }

    /* ── Download buttons ──────────────────────────── */
    .stDownloadButton > button {
        background: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        color: #475569 !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        border-radius: 10px !important;
    }
    .stDownloadButton > button:hover {
        border-color: #3B82F6 !important;
        color: #1D4ED8 !important;
        box-shadow: 0 2px 8px rgba(59,130,246,0.1) !important;
    }

    /* ── Tabs ───────────────────────────────────────── */
    .stTabs [data-baseweb="tab-list"] {
        background-color: #F1F5F9 !important;
        border-radius: 12px !important;
        padding: 4px !important;
        gap: 4px !important;
        border-bottom: none !important;
    }
    .stTabs [data-baseweb="tab"] {
        color: #64748B !important;
        border-radius: 8px !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        border-bottom: none !important;
        background-color: transparent !important;
    }
    .stTabs [data-baseweb="tab"]:hover {
        color: #1D4ED8 !important;
        background-color: rgba(59,130,246,0.05) !important;
    }
    .stTabs [aria-selected="true"] {
        background-color: #FFFFFF !important;
        color: #1D4ED8 !important;
        font-weight: 600 !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
    }
    .stTabs [data-baseweb="tab-panel"] {
        background-color: transparent !important;
    }
    .stTabs [data-baseweb="tab-highlight"] {
        background-color: transparent !important;
    }

    /* ── Expanders ──────────────────────────────────── */
    details[data-testid="stExpander"] {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 12px !important;
    }
    details[data-testid="stExpander"] summary {
        color: #475569 !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
    }
    details[data-testid="stExpander"] summary:hover {
        color: #1D4ED8 !important;
    }
    details[data-testid="stExpander"] > div {
        background-color: #FFFFFF !important;
    }

    /* ── Metrics ────────────────────────────────────── */
    [data-testid="stMetric"] {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 12px !important;
        padding: 16px !important;
    }
    [data-testid="stMetricLabel"] p {
        color: #94A3B8 !important;
    }
    [data-testid="stMetricValue"] {
        color: #0F172A !important;
    }
    [data-testid="stMetricDelta"] {
        color: #94A3B8 !important;
    }

    /* ── Progress ───────────────────────────────────── */
    .stProgress > div > div { background-color: #3B82F6 !important; }
    .stProgress > div { background-color: #E2E8F0 !important; }

    /* ── Alerts ─────────────────────────────────────── */
    [data-testid="stAlert"] {
        border-radius: 10px !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
    }
    .stSuccess, [data-testid="stAlert"]:has([data-testid*="Success"]) {
        background-color: #F0FDF4 !important;
        border: 1px solid #BBF7D0 !important;
    }
    .stInfo, [data-testid="stAlert"]:has([data-testid*="Info"]) {
        background-color: #EFF6FF !important;
        border: 1px solid #BFDBFE !important;
    }
    .stWarning, [data-testid="stAlert"]:has([data-testid*="Warning"]) {
        background-color: #FFFBEB !important;
        border: 1px solid #FDE68A !important;
    }
    .stError, [data-testid="stAlert"]:has([data-testid*="Error"]) {
        background-color: #FEF2F2 !important;
        border: 1px solid #FECACA !important;
    }
    [data-testid="stAlert"] p, [data-testid="stAlert"] span {
        color: #0F172A !important;
    }

    /* ── Dividers ───────────────────────────────────── */
    hr { border-color: #E2E8F0 !important; opacity: 1 !important; }

    /* ── DataFrames ─────────────────────────────────── */
    [data-testid="stDataFrame"] {
        border: 1px solid #E2E8F0 !important;
        border-radius: 12px !important;
    }
    [data-testid="stDataFrame"] table { background-color: #FFFFFF !important; }
    [data-testid="stDataFrame"] th {
        background-color: #F8FAFC !important;
        color: #64748B !important;
        font-family: 'Plus Jakarta Sans', sans-serif !important;
    }
    [data-testid="stDataFrame"] td {
        color: #0F172A !important;
        background-color: #FFFFFF !important;
        border-color: #F1F5F9 !important;
    }
    [data-testid="stDataFrame"] canvas + div { background-color: #FFFFFF !important; }

    /* ── Dialog / Modal ─────────────────────────────── */
    [data-testid="stModal"] > div {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 16px !important;
    }

    /* ── Code blocks ────────────────────────────────── */
    .stCodeBlock, .stCodeBlock pre, .stCodeBlock code,
    .stApp pre, .stApp code {
        background-color: #F8FAFC !important;
        color: #475569 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 12px !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 10px !important;
    }
    .stCodeBlock button { color: #64748B !important; }

    /* ── File uploader ──────────────────────────────── */
    [data-testid="stFileUploader"] { background-color: transparent !important; border-radius: 10px !important; }
    [data-testid="stFileUploader"] section {
        background-color: #F8FAFC !important;
        border: 1px dashed #CBD5E1 !important;
        border-radius: 10px !important;
    }
    [data-testid="stFileUploader"] section > div { color: #94A3B8 !important; }
    [data-testid="stFileUploader"] button {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        color: #475569 !important;
        border-radius: 8px !important;
    }

    /* ── Radio / Checkbox / Slider ──────────────────── */
    .stRadio > div, .stRadio label, .stRadio [role="radiogroup"] label p { color: #475569 !important; }
    .stRadio label[data-checked="true"], .stRadio label:has(input:checked) { color: #0F172A !important; }
    .stCheckbox label, .stCheckbox label p { color: #475569 !important; }
    .stCheckbox [data-testid="stCheckbox"] > label > span:first-child { border-color: #CBD5E1 !important; }
    .stSlider label p { color: #475569 !important; }
    .stSlider [data-baseweb="slider"] div[role="slider"] { background-color: #3B82F6 !important; }

    /* ── Tooltips ────────────────────────────────────── */
    [data-testid="stTooltipContent"], [data-baseweb="tooltip"] > div {
        background-color: #1E2A4A !important;
        color: #FFFFFF !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        border-radius: 8px !important;
    }

    /* ── Spinner / Caption ──────────────────────────── */
    .stSpinner > div { color: #3B82F6 !important; }
    .stSpinner p { color: #475569 !important; }
    .stCaption, .stCaption p { color: #94A3B8 !important; }

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * Custom HTML components
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    /* Header */
    .mli-header {
        background: linear-gradient(135deg, #1E3A8A, #2563EB);
        padding: 32px 40px;
        border-radius: 20px;
        margin-bottom: 32px;
        box-shadow: 0 4px 20px rgba(30,58,138,0.15);
    }
    .mli-logo {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 32px;
        font-weight: 800;
        color: #FFFFFF !important;
        letter-spacing: -1px;
        margin: 0;
    }
    .mli-logo span { color: #60A5FA; }
    .mli-subtitle {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 14px;
        color: rgba(255,255,255,0.7) !important;
        margin-top: 4px;
    }

    /* KPI Cards */
    .kpi-card {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        padding: 20px 24px;
        text-align: left;
        transition: box-shadow 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    }
    .kpi-card:hover { box-shadow: 0 4px 12px rgba(30,58,138,0.08); }
    .kpi-value {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 36px;
        font-weight: 800;
        color: #0F172A;
        line-height: 1.1;
        margin: 8px 0 0;
    }
    .kpi-label {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #94A3B8;
        margin-bottom: 0;
    }
    .kpi-delta {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        margin-top: 6px;
        color: #94A3B8;
    }
    .kpi-delta.positive { color: #22C55E; }
    .kpi-delta.negative { color: #EF4444; }

    /* Section cards */
    .mli-card {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 16px;
        transition: box-shadow 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    }
    .mli-card:hover { box-shadow: 0 4px 12px rgba(30,58,138,0.08); }
    .section-title {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 14px;
        font-weight: 600;
        color: #0F172A;
        margin-bottom: 16px;
    }

    /* Badges */
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

    /* Table rows */
    .row-header {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        font-weight: 500;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 1px;
        padding: 10px 0 10px 8px;
        border-bottom: 1px solid #E2E8F0;
        background: #F8FAFC;
        border-radius: 4px;
    }
    .row-cell {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 13px;
        color: #475569;
        padding: 8px 0 8px 8px;
        display: flex;
        align-items: center;
        min-height: 36px;
        border-bottom: 1px solid #F1F5F9;
    }

    /* Footer */
    .mli-footer {
        color: #94A3B8;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        letter-spacing: 0.5px;
    }

    /* Plotly */
    .js-plotly-plot { border-radius: 12px; }
</style>
""", unsafe_allow_html=True)


# ── Session State Init ───────────────────────────────────
if "report" not in st.session_state:
    st.session_state.report = None
if "audit_running" not in st.session_state:
    st.session_state.audit_running = False
if "audit_log" not in st.session_state:
    st.session_state.audit_log = []


# ── History helpers ─────────────────────────────────────
HISTORY_DIR = Path(__file__).parent / "output" / "history"


def ensure_history_dir():
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def save_audit_to_history(client: str, report: AuditReport, extra_data: dict):
    """Sauvegarde automatique apres chaque audit."""
    ensure_history_dir()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_client = client.replace(" ", "_").replace("/", "_")

    # Build full JSON
    results_list = []
    for r in report.results:
        entry = r.to_flat_dict()
        d = r.domain
        for key in ("adtech_results", "tracker_results", "load_times"):
            data = extra_data.get(key, {})
            if d in data:
                entry[key.replace("_results", "")] = data[d]
        if "ads_txt_results" in extra_data and d in extra_data["ads_txt_results"]:
            entry["ads_txt"] = extra_data["ads_txt_results"][d].to_flat_dict()
        if "geo_results" in extra_data and d in extra_data["geo_results"]:
            entry["geo"] = extra_data["geo_results"][d].to_flat_dict()
        results_list.append(entry)

    clean_domains = [r.domain for r in report.results if r.action == CleanAction.KEEP]

    payload = {
        "client": client,
        "audit_date": report.audit_date,
        "stats": {
            "total": report.total_sites,
            "alive": report.sites_alive,
            "dead": report.sites_dead,
            "mfa": report.sites_mfa,
            "flagged": report.sites_flagged,
            "avg_attention_score": report.avg_attention_score,
            "category_distribution": report.category_distribution,
        },
        "results": results_list,
        "whitelist_clean": clean_domains,
        "log": st.session_state.audit_log,
        "version": "1.0",
    }

    # Save JSON
    json_path = HISTORY_DIR / f"{safe_client}_{ts}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)

    # Save whitelist TXT
    txt_path = HISTORY_DIR / f"{safe_client}_{ts}_whitelist.txt"
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(clean_domains))

    return json_path


def list_history_files() -> list[dict]:
    """Liste les audits sauvegardes, tries du plus recent au plus ancien."""
    ensure_history_dir()
    entries = []
    for p in sorted(HISTORY_DIR.glob("*.json"), reverse=True):
        if p.name.endswith("_whitelist.json"):
            continue
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            client = data.get("client", "?")
            audit_date = data.get("audit_date", "")
            try:
                dt = datetime.fromisoformat(audit_date)
                display = f"{client} — {dt.strftime('%d/%m/%Y %H:%M')}"
            except Exception:
                display = f"{client} — {p.stem}"
            entries.append({"path": p, "display": display, "client": client, "data": data})
        except Exception:
            continue
    return entries


def load_history_into_session(data: dict):
    """Charge un audit sauvegarde dans session_state pour affichage."""
    results_data = data.get("results", [])
    stats = data.get("stats", {})

    # Rebuild a minimal AuditReport for display
    report = AuditReport()
    report.audit_date = data.get("audit_date", "")
    report.total_sites = stats.get("total", 0)
    report.sites_alive = stats.get("alive", 0)
    report.sites_dead = stats.get("dead", 0)
    report.sites_mfa = stats.get("mfa", 0)
    report.sites_flagged = stats.get("flagged", 0)
    report.avg_attention_score = stats.get("avg_attention_score", 0.0)
    report.category_distribution = stats.get("category_distribution", {})

    # Rebuild SiteAudit objects
    site_audits = []
    adtech_results = {}
    tracker_results = {}
    load_times = {}
    for entry in results_data:
        sa = SiteAudit(domain=entry.get("domain", ""))
        sa.health = HealthResult(
            status=SiteStatus(entry.get("http_status", "ok")),
            http_code=entry.get("http_code"),
            response_time_ms=entry.get("response_time_ms"),
        )
        sa.attention = AttentionResult(
            ad_count=entry.get("ad_count", 0),
            score=entry.get("attention_score", 10.0),
            is_mfa=entry.get("is_mfa", False),
        )
        from models import CategoryResult
        sa.categorization = CategoryResult(
            category=entry.get("category", "Autre"),
            confidence=entry.get("ai_confidence", 0.0),
        )
        action_str = entry.get("action", "keep")
        try:
            sa.action = CleanAction(action_str)
        except ValueError:
            sa.action = CleanAction.KEEP
        sa.action_reason = entry.get("action_reason", "")
        site_audits.append(sa)

        d = sa.domain
        if "adtech" in entry:
            adtech_results[d] = entry["adtech"]
        if "tracker" in entry:
            tracker_results[d] = entry["tracker"]
        if "load_times" in entry:
            load_times[d] = entry["load_times"]

    report.results = site_audits

    st.session_state.report = report
    st.session_state.adtech_results = adtech_results
    st.session_state.tracker_results = tracker_results
    st.session_state.load_times = load_times
    st.session_state.audit_log = data.get("log", [])
    # Clear screenshot data (not saved in history)
    st.session_state.screenshot_results = {}
    st.session_state.pop("geo_results", None)
    st.session_state.pop("ads_txt_results", None)


def get_previous_audit_stats(client: str) -> dict | None:
    """Trouve l'avant-dernier audit sauvegarde pour un client (pour comparaison).
    Saute le plus recent (celui qu'on vient de sauvegarder)."""
    ensure_history_dir()
    safe_client = client.replace(" ", "_").replace("/", "_")
    matching = sorted(HISTORY_DIR.glob(f"{safe_client}_*.json"), reverse=True)
    found = 0
    for p in matching:
        if p.name.endswith("_whitelist.json"):
            continue
        found += 1
        if found == 1:
            continue  # Skip the most recent (current audit)
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            stats = data.get("stats", {})
            audit_date = data.get("audit_date", "")
            return {"stats": stats, "audit_date": audit_date}
        except Exception:
            continue
    return None


# ── Audit Log ───────────────────────────────────────────
def log(message: str):
    """Ajoute une entree au journal avec timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {message}"
    st.session_state.audit_log.append(entry)


def get_log_text() -> str:
    return "\n".join(st.session_state.audit_log)


# ── Site Detail Modal ────────────────────────────────────
@st.dialog("Audit — Site", width="large")
def show_site_detail(domain: str):
    """Modal avec metriques, ad-tech, breakdown, screenshot."""
    report: AuditReport | None = st.session_state.get("report")
    if not report:
        st.warning("Aucun rapport disponible")
        return

    audit = None
    for a in report.results:
        if a.domain == domain:
            audit = a
            break
    if not audit:
        st.warning(f"Domaine {domain} introuvable")
        return

    screenshot_results = st.session_state.get("screenshot_results", {})
    screenshot_data = screenshot_results.get(domain, {})
    adtech_results = st.session_state.get("adtech_results", {})
    adtech_data = adtech_results.get(domain, {})
    tracker_results = st.session_state.get("tracker_results", {})
    tracker_data = tracker_results.get(domain, {})
    load_times = st.session_state.get("load_times", {})
    load_time = load_times.get(domain, 0)

    # 1. Metriques en ligne
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Score", f"{audit.attention.score}/10")
    c2.metric("Pubs", audit.attention.ad_count)
    c3.metric("Chargement", f"{load_time}ms" if load_time else "—")
    cookie_dismissed = screenshot_data.get("cookie_dismissed") if screenshot_data else None
    c4.metric("Cookie", "Oui" if cookie_dismissed else "—" if cookie_dismissed is None else "Non")

    # Status badge
    badge_map = {
        CleanAction.KEEP: ("SAIN", "badge-ok"),
        CleanAction.REMOVE_MFA: ("MFA", "badge-mfa"),
        CleanAction.REMOVE_DEAD: ("MORT", "badge-dead"),
        CleanAction.FLAG_LOW_ATTENTION: ("ATTENTION FAIBLE", "badge-flag"),
    }
    label, cls = badge_map.get(audit.action, ("—", ""))
    st.markdown(f'<span class="badge {cls}">{label}</span>', unsafe_allow_html=True)
    if audit.action_reason:
        st.caption(audit.action_reason)

    # 2. Ad-tech badges
    if adtech_data:
        badges_html = ""
        for key, display_name in ADTECH_DISPLAY.items():
            if adtech_data.get(key, False):
                badges_html += f'<span class="badge badge-present" style="margin:2px;">{display_name}</span> '
            else:
                badges_html += f'<span class="badge badge-absent" style="margin:2px;">{display_name}</span> '
        st.markdown(badges_html, unsafe_allow_html=True)

    # Tracker info
    if tracker_data:
        tracker_names = [k.replace("_", " ").title() for k, v in tracker_data.items() if v is True]
        if tracker_names:
            st.caption(f"Trackers : {', '.join(tracker_names)}")

    # 3. Breakdown zones
    breakdown = audit.attention.details or screenshot_data.get("breakdown", {})
    if breakdown:
        z1, z2, z3, z4, z5 = st.columns(5)
        z1.metric("ATF", breakdown.get("above_fold", 0))
        z2.metric("Mid", breakdown.get("mid_page", 0))
        z3.metric("Deep", breakdown.get("deep", 0))
        z4.metric("Footer", breakdown.get("footer", 0))
        z5.metric("Sticky", breakdown.get("sticky", 0))

    # Infos complementaires
    geo_results = st.session_state.get("geo_results", {})
    geo = geo_results.get(domain)
    ads_txt_results = st.session_state.get("ads_txt_results", {})
    ads = ads_txt_results.get(domain)

    if geo or audit.categorization.category != "Autre" or ads:
        st.markdown("---")
        info_cols = st.columns(3)
        if audit.categorization.category != "Autre":
            info_cols[0].metric("Categorie", audit.categorization.category)
        if geo:
            info_cols[1].metric("Serveur", f"{geo.server_country or '?'} ({geo.server_city or '?'})")
            info_cols[2].metric("Langue", geo.content_lang or geo.content_lang_code or "—")
        if ads:
            st.caption(f"ads.txt : {'Present' if ads.has_ads_txt else 'Absent'} — {ads.seller_count} sellers")

    # 4. Screenshot viewport (constrained inside modal)
    viewport_path = screenshot_data.get("viewport_path", "")
    if viewport_path and Path(viewport_path).exists():
        st.markdown("---")
        st.image(viewport_path, caption="Vue above the fold (1280x800)", use_container_width=True)

    # 5. Expander fullpage
    fullpage_path = screenshot_data.get("fullpage_path", "")
    if fullpage_path and Path(fullpage_path).exists():
        with st.expander("Page complete"):
            st.image(fullpage_path, use_container_width=True)


# ── Table renderer ───────────────────────────────────────
def render_table(df: pd.DataFrame, columns: dict[str, str], has_screenshots: bool = False, tab_id: str = ""):
    """Render a table with clickable domains + badges."""
    if df.empty:
        return

    cols_available = [c for c in columns if c in df.columns]
    col_labels = [columns[c] for c in cols_available]

    widths = []
    for c in cols_available:
        if c == "domain":
            widths.append(2.5)
        elif c in ("action_reason", "category"):
            widths.append(2)
        elif c in ("http_status", "action"):
            widths.append(1.2)
        else:
            widths.append(1)

    # Header
    header_cols = st.columns(widths)
    for i, lbl in enumerate(col_labels):
        header_cols[i].markdown(f'<div class="row-header">{lbl}</div>', unsafe_allow_html=True)

    # Rows
    for idx, (_, row) in enumerate(df.iterrows()):
        row_cols = st.columns(widths)
        for i, c in enumerate(cols_available):
            val = row.get(c, "")
            if c == "domain" and has_screenshots:
                with row_cols[i]:
                    if st.button(str(val), key=f"site_{tab_id}_{val}_{idx}", type="tertiary"):
                        show_site_detail(str(val))
            elif c == "action":
                badge_map = {
                    "keep": ("SAIN", "badge-ok"),
                    "remove_dead": ("MORT", "badge-dead"),
                    "remove_mfa": ("MFA", "badge-mfa"),
                    "flag_low_attention": ("ATTENTION", "badge-flag"),
                }
                lbl, cls = badge_map.get(str(val), (str(val), ""))
                row_cols[i].markdown(f'<span class="badge {cls}">{lbl}</span>', unsafe_allow_html=True)
            elif c == "is_mfa":
                if val:
                    row_cols[i].markdown('<span class="badge badge-mfa">OUI</span>', unsafe_allow_html=True)
                else:
                    row_cols[i].markdown('<div class="row-cell">—</div>', unsafe_allow_html=True)
            elif c == "attention_score":
                score = float(val) if val else 0
                if score >= 7:
                    color = "#22C55E"
                elif score >= MFA_THRESHOLD:
                    color = "#F97316"
                else:
                    color = "#EF4444"
                row_cols[i].markdown(
                    f'<div class="row-cell" style="font-weight:700;color:{color};">{score}</div>',
                    unsafe_allow_html=True,
                )
            else:
                display_val = str(val) if val is not None and str(val) != "nan" else "—"
                row_cols[i].markdown(f'<div class="row-cell">{display_val}</div>', unsafe_allow_html=True)


# ── Sidebar ──────────────────────────────────────────────
with st.sidebar:
    st.markdown("### MLI")

    client_name = st.text_input("Nom du client", value="Demo", help="Utilise pour nommer les exports")

    st.markdown("---")
    st.markdown("##### Modules")

    run_health = st.checkbox("Health Check (HTTP)", value=True, disabled=True, help="Toujours actif")
    run_attention = st.checkbox("Score d'Attention", value=True, help="Charge les pages pour compter les pubs")
    run_ads_txt = st.checkbox("Verification ads.txt", value=False, help="Verifie le fichier ads.txt et les SSPs autorises")
    run_localization = st.checkbox("Localisation", value=False, help="TLD, IP, pays serveur, langue du contenu")
    run_screenshots = st.checkbox("Captures d'ecran", value=False, help="Screenshot pleine page avec pubs surlignees")
    run_categorization = st.checkbox("Categorisation IA", value=True, help="Classifie chaque site par thematique (Mistral)")

    if run_categorization:
        st.markdown("---")
        st.markdown("##### Cle Mistral")
        mistral_key = st.text_input(
            "Cle API Mistral",
            type="password",
            help="Requis pour la categorisation. Obtenir une cle : console.mistral.ai",
            label_visibility="collapsed",
        )
        if mistral_key:
            if st.button("Verifier la cle", key="btn_validate_mistral"):
                with st.spinner("Verification..."):
                    is_valid, message = validate_mistral_key(mistral_key)
                if is_valid:
                    st.success(message)
                    st.session_state.mistral_key_valid = True
                else:
                    st.error(message)
                    st.session_state.mistral_key_valid = False
    else:
        mistral_key = None

    st.markdown("---")

    with st.expander("Avance"):
        http_concurrent = st.slider("Requetes HTTP paralleles", 10, 100, 50)
        pw_concurrent = st.slider("Pages Playwright paralleles", 1, 10, 5)
        attention_threshold = st.slider("Seuil MFA (score min)", 1.0, 8.0, MFA_THRESHOLD, 0.5)

    # ── History ──────────────────────────────────────────
    st.markdown("---")
    st.markdown("##### Historique")

    # Import from file
    imported_file = st.file_uploader(
        "Importer un audit (.json)",
        type=["json"],
        key="import_audit_file",
        label_visibility="collapsed",
    )
    if imported_file is not None:
        try:
            imported_data = json.loads(imported_file.read().decode("utf-8"))
            if "results" in imported_data and "stats" in imported_data:
                load_history_into_session(imported_data)
                st.rerun()
            else:
                st.error("Format JSON invalide (champs results/stats manquants)")
        except Exception as e:
            st.error(f"Erreur import : {e}")

    # Load from local history
    history_entries = list_history_files()
    if history_entries:
        history_options = ["— Aucun —"] + [e["display"] for e in history_entries]
        selected_history = st.selectbox(
            "Charger un audit precedent",
            history_options,
            index=0,
            key="history_select",
            label_visibility="collapsed",
        )

        if selected_history != "— Aucun —":
            idx = history_options.index(selected_history) - 1
            entry = history_entries[idx]

            col_load, col_del = st.columns(2)
            with col_load:
                if st.button("Charger", key="btn_load_history", use_container_width=True):
                    load_history_into_session(entry["data"])
                    st.rerun()

            with col_del:
                if st.button("Supprimer", key="btn_del_history", use_container_width=True):
                    st.session_state._confirm_delete_history = entry["path"]

            if st.session_state.get("_confirm_delete_history"):
                path_to_del = st.session_state._confirm_delete_history
                st.warning(f"Supprimer {Path(path_to_del).name} ?")
                c1, c2 = st.columns(2)
                with c1:
                    if st.button("Confirmer", key="btn_confirm_del"):
                        try:
                            Path(path_to_del).unlink(missing_ok=True)
                            wl_path = str(path_to_del).replace(".json", "_whitelist.txt")
                            Path(wl_path).unlink(missing_ok=True)
                        except Exception:
                            pass
                        st.session_state.pop("_confirm_delete_history", None)
                        st.rerun()
                with c2:
                    if st.button("Annuler", key="btn_cancel_del"):
                        st.session_state.pop("_confirm_delete_history", None)
                        st.rerun()
    else:
        st.caption("Aucun audit sauvegarde")

    st.markdown("---")
    st.markdown(
        "<p class='mli-footer' style='text-align:center;'>"
        "MLI v1.0 — Dentsu Programmatic Intelligence"
        "</p>",
        unsafe_allow_html=True,
    )


# ── Header ───────────────────────────────────────────────
st.markdown("""
<div class="mli-header">
    <h1 class="mli-logo">Media-List <span>Intelligence</span></h1>
    <p class="mli-subtitle">Audit industriel et automatise de vos whitelists programmatiques</p>
</div>
""", unsafe_allow_html=True)


# ── Input Section ────────────────────────────────────────
def parse_domains(source: str | io.BytesIO, is_file: bool = False) -> list[str]:
    """Parse domains from text input or uploaded file."""
    domains = []
    if is_file:
        try:
            df = pd.read_csv(source)
            for col_name in ["domain", "Domain", "url", "URL", "site", "Site"]:
                if col_name in df.columns:
                    domains = df[col_name].dropna().astype(str).tolist()
                    break
            else:
                domains = df.iloc[:, 0].dropna().astype(str).tolist()
        except Exception:
            content = source.read().decode("utf-8", errors="ignore")
            domains = [line.strip() for line in content.splitlines() if line.strip()]
    else:
        domains = [line.strip() for line in source.splitlines() if line.strip()]

    cleaned = []
    seen = set()
    for d in domains:
        d = d.replace("https://", "").replace("http://", "").replace("www.", "").rstrip("/").strip()
        if d and "." in d and d.lower() not in seen:
            seen.add(d.lower())
            cleaned.append(d)
    return cleaned


col1, col2 = st.columns([3, 2])
with col1:
    st.markdown("#### Liste de sites a auditer")
    input_method = st.radio(
        "Methode d'import",
        ["Coller une liste", "Uploader un fichier CSV"],
        horizontal=True,
        label_visibility="collapsed",
    )
with col2:
    st.markdown("&nbsp;")

domains = []

if input_method == "Coller une liste":
    text_input = st.text_area(
        "Un domaine par ligne",
        height=200,
        placeholder="lemonde.fr\nlequipe.fr\nboursorama.com\nmarmiton.org\nleboncoin.fr",
    )
    if text_input:
        domains = parse_domains(text_input)
else:
    uploaded_file = st.file_uploader(
        "Fichier CSV (colonne 'domain' ou premiere colonne)",
        type=["csv", "txt"],
    )
    if uploaded_file:
        domains = parse_domains(uploaded_file, is_file=True)

if domains:
    st.success(f"**{len(domains)}** domaines detectes et dedupliques")
    with st.expander(f"Voir les {len(domains)} domaines"):
        st.dataframe(
            pd.DataFrame({"Domaine": domains}),
            use_container_width=True,
            hide_index=True,
        )


# ── Run Audit ────────────────────────────────────────────
st.markdown("---")

if domains:
    if st.button("Lancer l'audit", type="primary", use_container_width=True):

        if run_categorization and not mistral_key:
            st.error("Cle API Mistral requise pour la categorisation.")
            st.stop()
        if run_categorization and st.session_state.get("mistral_key_valid") is False:
            st.error("Cle API Mistral invalide.")
            st.stop()
        if run_categorization and mistral_key:
            os.environ["MISTRAL_API_KEY"] = mistral_key

        # Reset log
        st.session_state.audit_log = []

        # ── Pipeline ─────────────────────────────────────
        audits: dict[str, SiteAudit] = {d: SiteAudit(domain=d) for d in domains}
        total_start = time.monotonic()

        progress_bar = st.progress(0, text="Initialisation...")

        # Live log inside st.status (auto-collapses when done)
        audit_status = st.status("Audit en cours...", expanded=True)
        with audit_status:
            log_placeholder = st.empty()

        total_steps = 1 + int(run_attention) + int(run_ads_txt) + int(run_localization) + int(run_screenshots) + int(run_categorization)
        current_step = 0

        def update_log_display():
            log_placeholder.code(get_log_text(), language=None)

        # ── HEALTH CHECK ─────────────────────────────────
        current_step += 1
        progress_bar.progress(5, text=f"Etape {current_step}/{total_steps} — Health Check HTTP...")
        log("━━ HEALTH CHECK ━━━━━━━━━━━━━━━━━━━━━━━━")
        step_start = time.monotonic()

        health_results = asyncio.run(check_all(domains))
        for domain_name, result in health_results.items():
            audits[domain_name].health = result
            if result.is_alive:
                log(f"  ✓ {domain_name} → {result.http_code} OK ({result.response_time_ms or 0}ms)")
            else:
                log(f"  ✗ {domain_name} → {result.status.value}")
        update_log_display()

        alive_domains = [d for d in domains if audits[d].health.is_alive]
        dead_count = len(domains) - len(alive_domains)
        step_elapsed = time.monotonic() - step_start
        log(f"  → {len(alive_domains)} vivants · {dead_count} morts · {step_elapsed:.1f}s")
        log("")
        update_log_display()
        progress_bar.progress(int(current_step / total_steps * 90))

        # ── ATTENTION SCORING ────────────────────────────
        content_langs = {}
        adtech_results_data = {}
        tracker_results_data = {}
        load_times_data = {}
        if run_attention and alive_domains:
            current_step += 1
            progress_bar.progress(int((current_step - 0.5) / total_steps * 90), text=f"Etape {current_step}/{total_steps} — Score d'attention...")
            log("━━ SCORE D'ATTENTION ━━━━━━━━━━━━━━━━━━━")
            update_log_display()
            step_start = time.monotonic()

            attention_results, content_langs, adtech_results_data, tracker_results_data, load_times_data = score_all_subprocess(alive_domains)
            for domain_name, result in attention_results.items():
                audits[domain_name].attention = result
                details = result.details or {}
                atf = details.get("above_fold", 0)
                mid = details.get("mid_page", 0)
                deep = details.get("deep", 0)
                footer = details.get("footer", 0)
                adtech = adtech_results_data.get(domain_name, {})
                scripts = adtech.get("scripts_detected", [])
                scripts_str = ", ".join(scripts) if scripts else "aucun"
                log(f"  ✓ {domain_name} → {result.ad_count} pubs (ATF:{atf} Mid:{mid} Deep:{deep} Footer:{footer}) → {result.score}/10")
                log(f"    Ad-tech: {scripts_str} | Chargement: {load_times_data.get(domain_name, 0)}ms")

            st.session_state.adtech_results = adtech_results_data
            st.session_state.tracker_results = tracker_results_data
            st.session_state.load_times = load_times_data

            step_elapsed = time.monotonic() - step_start
            log(f"  → Termine en {step_elapsed:.1f}s")
            log("")
            update_log_display()
            progress_bar.progress(int(current_step / total_steps * 90))

        # ── ADS.TXT ──────────────────────────────────────
        ads_txt_results = {}
        if run_ads_txt and alive_domains:
            current_step += 1
            progress_bar.progress(int((current_step - 0.5) / total_steps * 90), text=f"Etape {current_step}/{total_steps} — ads.txt...")
            log("━━ ADS.TXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            update_log_display()
            step_start = time.monotonic()

            ads_txt_results = asyncio.run(check_all_ads_txt(alive_domains))
            st.session_state.ads_txt_results = ads_txt_results

            for domain_name, r in ads_txt_results.items():
                if r.has_ads_txt:
                    seller_type = ""
                    if r.is_direct and r.is_reseller:
                        seller_type = "DIRECT + RESELLER"
                    elif r.is_direct:
                        seller_type = "DIRECT"
                    elif r.is_reseller:
                        seller_type = "RESELLER"
                    log(f"  ✓ {domain_name} → {r.seller_count} sellers ({seller_type})")
                else:
                    log(f"  ✗ {domain_name} → ads.txt absent")

            step_elapsed = time.monotonic() - step_start
            log(f"  → Termine en {step_elapsed:.1f}s")
            log("")
            update_log_display()
            progress_bar.progress(int(current_step / total_steps * 90))

        # ── LOCALISATION ─────────────────────────────────
        geo_results = {}
        if run_localization and alive_domains:
            current_step += 1
            progress_bar.progress(int((current_step - 0.5) / total_steps * 90), text=f"Etape {current_step}/{total_steps} — Localisation...")
            log("━━ LOCALISATION ━━━━━━━━━━━━━━━━━━━━━━━")
            update_log_display()
            step_start = time.monotonic()
            geo_progress = st.progress(0, text="Geolocalisation en cours...")

            def _geo_callback(done, total, domain_name, result):
                geo_progress.progress(done / total, text=f"Geolocalisation {done}/{total} — {domain_name}")
                log(f"  ✓ {domain_name} → {result.server_country or '?'} ({result.server_city or '?'}) | Langue: {result.content_lang or result.content_lang_code or '?'} | TLD: {result.tld or '?'}")
                update_log_display()

            geo_results = localize_all(alive_domains, content_langs, progress_callback=_geo_callback)
            geo_progress.empty()
            st.session_state.geo_results = geo_results

            step_elapsed = time.monotonic() - step_start
            log(f"  → Termine en {step_elapsed:.1f}s")
            log("")
            update_log_display()
            progress_bar.progress(int(current_step / total_steps * 90))

        # ── SCREENSHOTS ──────────────────────────────────
        screenshot_results = {}
        if run_screenshots and alive_domains:
            current_step += 1
            progress_bar.progress(int((current_step - 0.5) / total_steps * 90), text=f"Etape {current_step}/{total_steps} — Captures d'ecran...")
            log("━━ SCREENSHOTS ━━━━━━━━━━━━━━━━━━━━━━━━")
            update_log_display()
            step_start = time.monotonic()

            output_dir = str(Path(__file__).parent / "output" / "screenshots")
            screenshot_results = screenshot_all_subprocess(alive_domains, output_dir=output_dir)
            st.session_state.screenshot_results = screenshot_results
            st.session_state.screenshot_dir = output_dir

            for domain_name, sdata in screenshot_results.items():
                if sdata.get("error"):
                    log(f"  ✗ {domain_name} → ERREUR: {sdata['error'][:80]}")
                else:
                    log(f"  ✓ {domain_name} → viewport + fullpage captures")

            step_elapsed = time.monotonic() - step_start
            log(f"  → Termine en {step_elapsed:.1f}s")
            log("")
            update_log_display()
            progress_bar.progress(int(current_step / total_steps * 90))

        # ── CATEGORISATION IA ────────────────────────────
        if run_categorization and alive_domains:
            current_step += 1
            progress_bar.progress(int((current_step - 0.5) / total_steps * 90), text=f"Etape {current_step}/{total_steps} — Categorisation IA...")
            log("━━ CATEGORISATION IA (Mistral) ━━━━━━━━")
            update_log_display()
            step_start = time.monotonic()

            metadata_map = {}
            if run_attention:
                metadata_map = extract_metadata_subprocess(alive_domains)
            else:
                metadata_map = {d: {} for d in alive_domains}

            cat_results = categorize_all(alive_domains, metadata_map)
            for domain_name, result in cat_results.items():
                audits[domain_name].categorization = result
                log(f"  ✓ {domain_name} → {result.category} ({result.confidence:.0%})")

            step_elapsed = time.monotonic() - step_start
            log(f"  → Termine en {step_elapsed:.1f}s")
            log("")
            update_log_display()
            progress_bar.progress(int(current_step / total_steps * 90))

        # ── Decisions finales ────────────────────────────
        for audit in audits.values():
            audit.decide_action()

        report = AuditReport(results=list(audits.values()))
        report.compute_stats()
        st.session_state.report = report

        elapsed = time.monotonic() - total_start
        log(f"━━ AUDIT TERMINE en {elapsed:.1f}s — {len(alive_domains)} sites audites ━━")
        update_log_display()
        progress_bar.progress(100, text=f"Audit termine en {elapsed:.1f}s")

        # Close the live status (collapses automatically)
        audit_status.update(label=f"Audit termine en {elapsed:.1f}s", state="complete", expanded=False)

        st.balloons()

        # ── Auto-save to history ─────────────────────────
        try:
            extra = {
                "adtech_results": st.session_state.get("adtech_results", {}),
                "tracker_results": st.session_state.get("tracker_results", {}),
                "load_times": st.session_state.get("load_times", {}),
                "ads_txt_results": ads_txt_results,
                "geo_results": geo_results,
            }
            saved_path = save_audit_to_history(client_name, report, extra)
            log(f"  Sauvegarde → {Path(saved_path).name}")
            update_log_display()
        except Exception as save_err:
            log(f"  Erreur sauvegarde : {save_err}")
            update_log_display()

else:
    st.info("Collez ou uploadez votre liste de sites pour commencer l'audit.")


# ══════════════════════════════════════════════════════════
# RESULTS DASHBOARD
# ══════════════════════════════════════════════════════════
if st.session_state.report:
    report: AuditReport = st.session_state.report

    st.markdown("---")
    st.markdown("## Resultats de l'audit")

    # ── KPI Cards (with comparison delta) ───────────────
    # Find previous audit for same client to show deltas
    prev = get_previous_audit_stats(client_name)
    prev_stats = prev["stats"] if prev else {}
    prev_date_str = ""
    if prev:
        try:
            prev_dt = datetime.fromisoformat(prev["audit_date"])
            prev_date_str = prev_dt.strftime("%d/%m/%Y")
        except Exception:
            prev_date_str = ""

    def delta_html(current_val: float, prev_key: str, invert: bool = False) -> str:
        """Generate delta HTML. invert=True means lower is better (e.g. sites cleaned)."""
        if not prev_stats or prev_key not in prev_stats:
            return ""
        prev_val = prev_stats[prev_key]
        diff = current_val - prev_val
        if diff == 0:
            return ""
        sign = "+" if diff > 0 else ""
        # For inverted metrics (cleaned sites), fewer is better
        if invert:
            css_class = "negative" if diff > 0 else "positive"
        else:
            css_class = "positive" if diff > 0 else "negative"
        fmt = f"{sign}{diff:.1f}" if isinstance(diff, float) and not diff.is_integer() else f"{sign}{int(diff)}"
        return f'<div class="kpi-delta {css_class}">{fmt} vs {prev_date_str}</div>'

    k1, k2, k3, k4 = st.columns(4)

    with k1:
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-label">Sites audites</div>
            <div class="kpi-value">{report.total_sites}</div>
            <div class="kpi-delta">100% de la whitelist</div>
        </div>
        """, unsafe_allow_html=True)

    with k2:
        cleaned = report.sites_dead + report.sites_mfa
        prev_cleaned = prev_stats.get("dead", 0) + prev_stats.get("mfa", 0) if prev_stats else None
        cleaned_delta = ""
        if prev_cleaned is not None:
            diff = cleaned - prev_cleaned
            if diff != 0:
                sign = "+" if diff > 0 else ""
                css = "negative" if diff > 0 else "positive"
                cleaned_delta = f'<div class="kpi-delta {css}">{sign}{int(diff)} vs {prev_date_str}</div>'
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-label">Sites nettoyes</div>
            <div class="kpi-value" style="color:#DC2626;">{cleaned}</div>
            <div class="kpi-delta negative">{report.sites_dead} morts · {report.sites_mfa} MFA</div>
            {cleaned_delta}
        </div>
        """, unsafe_allow_html=True)

    with k3:
        healthy = report.sites_alive - report.sites_mfa - report.sites_flagged
        prev_healthy = ""
        if prev_stats:
            ph = prev_stats.get("alive", 0) - prev_stats.get("mfa", 0) - prev_stats.get("flagged", 0)
            diff = healthy - ph
            if diff != 0:
                sign = "+" if diff > 0 else ""
                css = "positive" if diff > 0 else "negative"
                prev_healthy = f'<div class="kpi-delta {css}">{sign}{int(diff)} vs {prev_date_str}</div>'
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-label">Sites sains</div>
            <div class="kpi-value" style="color:#22C55E;">{healthy}</div>
            <div class="kpi-delta">{report.sites_flagged} en surveillance</div>
            {prev_healthy}
        </div>
        """, unsafe_allow_html=True)

    with k4:
        score_delta = delta_html(report.avg_attention_score, "avg_attention_score")
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-label">Score attention moy.</div>
            <div class="kpi-value" style="color:#1D4ED8;">{report.avg_attention_score}<span style="font-size:14px;color:#94A3B8;">/10</span></div>
            <div class="kpi-delta">Sur les sites actifs</div>
            {score_delta}
        </div>
        """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # ── Charts ───────────────────────────────────────────
    chart1, chart2 = st.columns(2)

    with chart1:
        st.markdown('<div class="mli-card"><div class="section-title">Sante de la liste</div>', unsafe_allow_html=True)

        healthy = report.sites_alive - report.sites_mfa - report.sites_flagged
        health_data = pd.DataFrame({
            "Status": ["Sains", "Attention faible", "MFA", "Morts"],
            "Nombre": [healthy, report.sites_flagged, report.sites_mfa, report.sites_dead],
        })
        health_data = health_data[health_data["Nombre"] > 0]

        fig_health = px.pie(
            health_data, values="Nombre", names="Status", color="Status",
            color_discrete_map={
                "Sains": "#22C55E", "Attention faible": "#6366F1",
                "MFA": "#F97316", "Morts": "#EF4444",
            },
            hole=0.55,
        )
        fig_health.update_layout(
            **PLOTLY_LAYOUT,
            showlegend=True,
            legend=dict(orientation="h", yanchor="bottom", y=-0.15, xanchor="center", x=0.5, font=dict(size=11, color="#64748B")),
            margin=dict(t=10, b=40, l=10, r=10),
            height=300,
        )
        fig_health.update_traces(textinfo="value+percent", textfont_color="#0F172A")
        st.plotly_chart(fig_health, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with chart2:
        st.markdown('<div class="mli-card"><div class="section-title">Repartition categorielle</div>', unsafe_allow_html=True)

        if report.category_distribution:
            cat_df = pd.DataFrame(
                list(report.category_distribution.items()),
                columns=["Categorie", "Nombre"],
            ).sort_values("Nombre", ascending=True)

            fig_cat = px.bar(
                cat_df, x="Nombre", y="Categorie", orientation="h",
                color_discrete_sequence=["#3B82F6"],
            )
            fig_cat.update_layout(
                **PLOTLY_LAYOUT, showlegend=False,
                margin=dict(t=10, b=10, l=10, r=10), height=300,
                xaxis=PLOTLY_AXIS, yaxis=dict(showgrid=False, tickfont=dict(color="#64748B")),
            )
            st.plotly_chart(fig_cat, use_container_width=True)
        else:
            st.info("Categorisation non executee")
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Stacked bar attention par zone ───────────────────
    alive_audits = [a for a in report.results if a.health.is_alive]
    if alive_audits and any(a.attention.ad_count > 0 or a.attention.score < 10 for a in alive_audits):
        st.markdown('<div class="mli-card"><div class="section-title">Encombrement publicitaire par zone</div>', unsafe_allow_html=True)

        att_rows = []
        for a in sorted(alive_audits, key=lambda x: x.attention.score, reverse=False):
            details = a.attention.details or {}
            att_rows.append({
                "Domaine": a.domain,
                "ATF": details.get("above_fold", 0),
                "Mid": details.get("mid_page", 0),
                "Deep": details.get("deep", 0),
                "Footer": details.get("footer", 0),
                "Sticky": details.get("sticky", 0),
            })

        att_df = pd.DataFrame(att_rows)
        fig_att = go.Figure()
        zone_colors = {"ATF": "#EF4444", "Mid": "#F97316", "Deep": "#EAB308", "Footer": "#CBD5E1", "Sticky": "#8B5CF6"}
        for zone, color in zone_colors.items():
            fig_att.add_trace(go.Bar(
                y=att_df["Domaine"], x=att_df[zone],
                name=zone, orientation="h", marker_color=color,
            ))
        fig_att.update_layout(
            **PLOTLY_LAYOUT, barmode="stack",
            margin=dict(t=10, b=10, l=10, r=10),
            height=max(250, len(att_rows) * 30 + 60),
            xaxis=dict(**PLOTLY_AXIS, title="Nombre de pubs"),
            yaxis=dict(showgrid=False, tickfont=dict(color="#64748B")),
            legend=dict(orientation="h", yanchor="bottom", y=-0.2, xanchor="center", x=0.5, font=dict(size=11, color="#64748B")),
        )
        st.plotly_chart(fig_att, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Ad-Tech Adoption Chart ───────────────────────────
    adtech_results = st.session_state.get("adtech_results", {})
    if adtech_results:
        st.markdown('<div class="mli-card"><div class="section-title">Adoption des technologies ad-tech</div>', unsafe_allow_html=True)

        adtech_counts = {}
        for key, display_label in ADTECH_DISPLAY.items():
            count = sum(1 for d in adtech_results.values() if d.get(key, False))
            if count > 0:
                adtech_counts[display_label] = count

        if adtech_counts:
            adtech_df = pd.DataFrame(
                list(adtech_counts.items()), columns=["Technologie", "Nb sites"],
            ).sort_values("Nb sites", ascending=True)

            fig_adtech = px.bar(
                adtech_df, x="Nb sites", y="Technologie", orientation="h",
                color_discrete_sequence=["#3B82F6"],
            )
            fig_adtech.update_layout(
                **PLOTLY_LAYOUT, showlegend=False,
                margin=dict(t=10, b=10, l=10, r=10),
                height=max(200, len(adtech_counts) * 35 + 40),
                xaxis=PLOTLY_AXIS, yaxis=dict(showgrid=False, tickfont=dict(color="#64748B")),
            )
            st.plotly_chart(fig_adtech, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Geo Chart ────────────────────────────────────────
    geo_results = st.session_state.get("geo_results", {})
    if geo_results:
        st.markdown('<div class="mli-card"><div class="section-title">Repartition geographique des serveurs</div>', unsafe_allow_html=True)

        country_counts = {}
        for r in geo_results.values():
            country = r.server_country or "Inconnu"
            country_counts[country] = country_counts.get(country, 0) + 1

        geo_df = pd.DataFrame(
            list(country_counts.items()), columns=["Pays", "Nombre"],
        ).sort_values("Nombre", ascending=True)

        fig_geo = px.bar(
            geo_df, x="Nombre", y="Pays", orientation="h",
            color_discrete_sequence=["#3B82F6"],
        )
        fig_geo.update_layout(
            **PLOTLY_LAYOUT, showlegend=False,
            margin=dict(t=10, b=10, l=10, r=10),
            height=max(200, len(country_counts) * 35 + 40),
            xaxis=PLOTLY_AXIS, yaxis=dict(showgrid=False, tickfont=dict(color="#64748B")),
        )
        st.plotly_chart(fig_geo, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # ── SSP Chart ────────────────────────────────────────
    ads_txt_results = st.session_state.get("ads_txt_results", {})
    if ads_txt_results:
        st.markdown('<div class="mli-card"><div class="section-title">Top 10 SSPs (ads.txt)</div>', unsafe_allow_html=True)

        ssp_site_counts: dict[str, int] = {}
        for domain_name, r in ads_txt_results.items():
            if r.has_ads_txt:
                seen_ssps = set()
                for seller in r.sellers:
                    ssp_name = seller.get("ssp_name", seller.get("domain", ""))
                    if ssp_name not in seen_ssps:
                        seen_ssps.add(ssp_name)
                        ssp_site_counts[ssp_name] = ssp_site_counts.get(ssp_name, 0) + 1

        if ssp_site_counts:
            top_ssps = sorted(ssp_site_counts.items(), key=lambda x: x[1], reverse=True)[:10]
            ssp_df = pd.DataFrame(top_ssps, columns=["SSP", "Nb sites"]).sort_values("Nb sites", ascending=True)

            fig_ssp = px.bar(
                ssp_df, x="Nb sites", y="SSP", orientation="h",
                color_discrete_sequence=["#3B82F6"],
            )
            fig_ssp.update_layout(
                **PLOTLY_LAYOUT, showlegend=False,
                margin=dict(t=10, b=10, l=10, r=10),
                height=max(200, len(top_ssps) * 35 + 40),
                xaxis=PLOTLY_AXIS, yaxis=dict(showgrid=False, tickfont=dict(color="#64748B")),
            )
            st.plotly_chart(fig_ssp, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # ══════════════════════════════════════════════════════
    # TABS — Detail, Ad-Tech, Journal, etc.
    # ══════════════════════════════════════════════════════
    st.markdown("### Detail par site")

    has_screenshots = bool(st.session_state.get("screenshot_results"))

    tab_labels = [
        f"Sites sains ({report.sites_alive - report.sites_mfa - report.sites_flagged})",
        f"Attention faible ({report.sites_flagged})",
        f"A supprimer ({report.sites_dead + report.sites_mfa})",
        f"Vue complete ({report.total_sites})",
    ]
    if adtech_results:
        tab_labels.append(f"Ad-Tech Stack ({len(adtech_results)})")
    if ads_txt_results:
        tab_labels.append(f"ads.txt ({len(ads_txt_results)})")
    if geo_results:
        tab_labels.append(f"Localisation ({len(geo_results)})")
        tab_labels.append("Carte")
    # Journal tab — always present if logs exist
    if st.session_state.audit_log:
        tab_labels.append("Journal")

    tabs = st.tabs(tab_labels)

    flat_data = [r.to_flat_dict() for r in report.results]
    df_all = pd.DataFrame(flat_data)

    col_display = {
        "domain": "Domaine",
        "http_status": "Status",
        "http_code": "Code",
        "response_time_ms": "Temps (ms)",
        "ad_count": "Nb pubs",
        "attention_score": "Score",
        "is_mfa": "MFA",
        "category": "Categorie",
        "action": "Action",
    }

    with tabs[0]:
        df_ok = df_all[df_all["action"] == "keep"].sort_values("attention_score", ascending=False)
        if not df_ok.empty:
            render_table(df_ok, col_display, has_screenshots, tab_id="ok")
        else:
            st.info("Aucun site sain detecte")

    with tabs[1]:
        df_flag = df_all[df_all["action"] == "flag_low_attention"]
        if not df_flag.empty:
            render_table(df_flag, col_display, has_screenshots, tab_id="flag")
        else:
            st.info("Aucun site flagge")

    with tabs[2]:
        df_remove = df_all[df_all["action"].isin(["remove_dead", "remove_mfa"])]
        if not df_remove.empty:
            render_table(df_remove, col_display, has_screenshots, tab_id="rm")
        else:
            st.info("Aucun site a supprimer")

    with tabs[3]:
        render_table(df_all, col_display, has_screenshots, tab_id="all")

    extra_tab_idx = 4

    # Ad-Tech Stack tab
    if adtech_results:
        with tabs[extra_tab_idx]:
            adtech_cols_keys = list(ADTECH_DISPLAY.keys())
            adtech_cols_labels = list(ADTECH_DISPLAY.values())
            tracker_results_state = st.session_state.get("tracker_results", {})

            header_widths = [2.5] + [1] * len(adtech_cols_labels) + [1]
            header_row = st.columns(header_widths)
            header_row[0].markdown('<div class="row-header">Domaine</div>', unsafe_allow_html=True)
            for i, lbl in enumerate(adtech_cols_labels):
                header_row[i + 1].markdown(f'<div class="row-header">{lbl}</div>', unsafe_allow_html=True)
            header_row[-1].markdown('<div class="row-header">Trackers</div>', unsafe_allow_html=True)

            for idx, domain_name in enumerate(sorted(adtech_results.keys())):
                ad_data = adtech_results[domain_name]
                tr_data = tracker_results_state.get(domain_name, {})
                row_cols = st.columns(header_widths)

                with row_cols[0]:
                    if has_screenshots:
                        if st.button(domain_name, key=f"site_adtech_{domain_name}_{idx}", type="tertiary"):
                            show_site_detail(domain_name)
                    else:
                        st.markdown(f'<div class="row-cell">{domain_name}</div>', unsafe_allow_html=True)

                for i, key in enumerate(adtech_cols_keys):
                    if ad_data.get(key, False):
                        row_cols[i + 1].markdown('<span class="badge badge-present">OUI</span>', unsafe_allow_html=True)
                    else:
                        row_cols[i + 1].markdown('<span class="badge badge-absent">—</span>', unsafe_allow_html=True)

                tracker_total = tr_data.get("total", 0)
                row_cols[-1].markdown(f'<div class="row-cell">{tracker_total}</div>', unsafe_allow_html=True)

        extra_tab_idx += 1

    # ads.txt tab
    if ads_txt_results:
        with tabs[extra_tab_idx]:
            ads_rows = []
            for domain_name, r in ads_txt_results.items():
                presence = "Oui" if r.has_ads_txt else "Non"
                if r.is_direct and r.is_reseller:
                    seller_type = "DIRECT + RESELLER"
                elif r.is_direct:
                    seller_type = "DIRECT"
                elif r.is_reseller:
                    seller_type = "RESELLER"
                else:
                    seller_type = "—"
                ads_rows.append({
                    "Domaine": domain_name,
                    "ads.txt": presence,
                    "Nb sellers": r.seller_count if r.has_ads_txt else 0,
                    "Type": seller_type if r.has_ads_txt else "—",
                    "Top SSPs": ", ".join(r.top_ssps[:5]) if r.has_ads_txt else "—",
                })

            df_ads = pd.DataFrame(ads_rows)
            st.dataframe(df_ads, use_container_width=True, hide_index=True)
        extra_tab_idx += 1

    # Localisation tab
    if geo_results:
        with tabs[extra_tab_idx]:
            geo_loc_display = {
                "domain": "Domaine", "tld": "TLD", "tld_country": "Pays TLD",
                "ip_address": "IP", "server_country": "Pays serveur",
                "server_city": "Ville", "server_isp": "ISP", "content_lang": "Langue",
            }
            geo_rows = []
            for domain_name, r in geo_results.items():
                row = r.to_flat_dict()
                row["domain"] = domain_name
                row["content_lang"] = r.content_lang or r.content_lang_code or ""
                geo_rows.append(row)

            df_geo = pd.DataFrame(geo_rows)
            geo_cols = [c for c in geo_loc_display if c in df_geo.columns]
            st.dataframe(
                df_geo[geo_cols].rename(columns=geo_loc_display),
                use_container_width=True, hide_index=True,
            )
        extra_tab_idx += 1

        # ── CARTE TAB (Scattergeo map) ──────────────────
        with tabs[extra_tab_idx]:
            map_rows = []
            for domain_name, r in geo_results.items():
                cc = r.server_country_code.upper() if hasattr(r, "server_country_code") and r.server_country_code else ""
                if not cc and r.server_country:
                    # Try reverse lookup from TLD_COUNTRY_MAP
                    for code, name in TLD_COUNTRY_MAP.items():
                        if name == r.server_country:
                            cc = code.upper()
                            break
                if cc not in COUNTRY_COORDS:
                    continue
                lat, lon = COUNTRY_COORDS[cc]

                # Find audit action for color
                action_color = "#22C55E"  # default keep
                for a in report.results:
                    if a.domain == domain_name:
                        if a.action in (CleanAction.REMOVE_DEAD, CleanAction.REMOVE_MFA):
                            action_color = "#EF4444"
                        elif a.action == CleanAction.FLAG_LOW_ATTENTION:
                            action_color = "#F97316"
                        break

                score = 5.0
                for a in report.results:
                    if a.domain == domain_name:
                        score = a.attention.score
                        break

                map_rows.append({
                    "domain": domain_name,
                    "lat": lat, "lon": lon,
                    "country": r.server_country or cc,
                    "ip": r.ip_address or "",
                    "isp": r.server_isp or "",
                    "score": score,
                    "size": max(score * 3, 5),
                    "color": action_color,
                })

            if map_rows:
                map_df = pd.DataFrame(map_rows)
                fig_map = go.Figure()

                # Group by color for legend
                color_labels = {"#22C55E": "Sain", "#EF4444": "A supprimer", "#F97316": "Attention faible"}
                for color, label in color_labels.items():
                    subset = map_df[map_df["color"] == color]
                    if subset.empty:
                        continue
                    fig_map.add_trace(go.Scattergeo(
                        lat=subset["lat"],
                        lon=subset["lon"],
                        text=subset.apply(lambda r: f"{r['domain']}<br>{r['country']} · {r['ip']}<br>{r['isp']}<br>Score: {r['score']}/10", axis=1),
                        hoverinfo="text",
                        marker=dict(
                            size=subset["size"],
                            color=color,
                            opacity=0.85,
                            line=dict(width=0.5, color="rgba(0,0,0,0.1)"),
                        ),
                        name=label,
                    ))

                fig_map.update_geos(
                    projection_type="natural earth",
                    landcolor="#F1F5F9",
                    oceancolor="#DBEAFE",
                    lakecolor="#DBEAFE",
                    coastlinecolor="#CBD5E1",
                    countrycolor="#E2E8F0",
                    bgcolor="rgba(0,0,0,0)",
                    showframe=False,
                    showcoastlines=True,
                    showcountries=True,
                )
                fig_map.update_layout(
                    **PLOTLY_LAYOUT,
                    height=450,
                    margin=dict(t=0, b=0, l=0, r=0),
                    legend=dict(
                        orientation="h", yanchor="bottom", y=-0.05,
                        xanchor="center", x=0.5,
                        font=dict(size=11, color="#64748B"),
                    ),
                    geo=dict(bgcolor="rgba(0,0,0,0)"),
                )
                st.plotly_chart(fig_map, use_container_width=True)
            else:
                st.info("Aucune coordonnee disponible pour afficher la carte")

        extra_tab_idx += 1

    # ── JOURNAL TAB (persistent) ─────────────────────────
    if st.session_state.audit_log:
        with tabs[extra_tab_idx]:
            log_text = get_log_text()

            # Download + display
            jl1, jl2 = st.columns([1, 5])
            with jl1:
                date_str = datetime.now().strftime("%Y%m%d_%H%M")
                st.download_button(
                    "Telecharger le journal",
                    data=log_text,
                    file_name=f"audit_log_{client_name}_{date_str}.txt",
                    mime="text/plain",
                    use_container_width=True,
                )

            # st.code for native copy + monospace + scroll
            st.code(log_text, language=None)

    # ══════════════════════════════════════════════════════
    # EXPORTS
    # ══════════════════════════════════════════════════════
    st.markdown("---")
    st.markdown("### Exports")

    screenshot_results = st.session_state.get("screenshot_results", {})
    dl_col_count = 3
    if screenshot_results:
        dl_col_count = 4
    dl_cols = st.columns(dl_col_count)

    with dl_cols[0]:
        excel_buffer = io.BytesIO()
        df_export = df_all.copy()

        # Ad-tech columns
        if adtech_results:
            adtech_export_rows = []
            for _, row in df_export.iterrows():
                d = row.get("domain", "")
                ad_data = adtech_results.get(d, {})
                tr_data = st.session_state.get("tracker_results", {}).get(d, {})
                lt = st.session_state.get("load_times", {}).get(d, 0)
                adtech_export_rows.append({
                    "adtech_gpt": "Oui" if ad_data.get("gpt") else "Non",
                    "adtech_prebid": "Oui" if ad_data.get("prebid") else "Non",
                    "adtech_amazon": "Oui" if ad_data.get("amazon_tam") else "Non",
                    "adtech_criteo": "Oui" if ad_data.get("criteo") else "Non",
                    "adtech_teads": "Oui" if ad_data.get("teads") else "Non",
                    "adtech_taboola": "Oui" if ad_data.get("taboola") else "Non",
                    "adtech_outbrain": "Oui" if ad_data.get("outbrain") else "Non",
                    "adtech_scripts": ", ".join(ad_data.get("scripts_detected", [])),
                    "trackers_total": tr_data.get("total", 0),
                    "page_load_ms": lt,
                })
            df_adtech_extra = pd.DataFrame(adtech_export_rows)
            df_export = pd.concat([df_export.reset_index(drop=True), df_adtech_extra.reset_index(drop=True)], axis=1)

        if ads_txt_results:
            ads_export_rows = []
            for _, row in df_export.iterrows():
                d = row.get("domain", "")
                if d in ads_txt_results:
                    r = ads_txt_results[d]
                    if r.is_direct and r.is_reseller:
                        seller_type = "DIRECT + RESELLER"
                    elif r.is_direct:
                        seller_type = "DIRECT"
                    elif r.is_reseller:
                        seller_type = "RESELLER"
                    else:
                        seller_type = ""
                    ads_export_rows.append({
                        "ads_txt_present": "Oui" if r.has_ads_txt else "Non",
                        "ads_txt_sellers": r.seller_count,
                        "ads_txt_type": seller_type,
                        "ads_txt_top_ssps": ", ".join(r.top_ssps[:10]),
                    })
                else:
                    ads_export_rows.append({"ads_txt_present": "", "ads_txt_sellers": 0, "ads_txt_type": "", "ads_txt_top_ssps": ""})
            df_ads_extra = pd.DataFrame(ads_export_rows)
            df_export = pd.concat([df_export.reset_index(drop=True), df_ads_extra.reset_index(drop=True)], axis=1)

        if geo_results:
            geo_export_rows = []
            for _, row in df_export.iterrows():
                d = row.get("domain", "")
                if d in geo_results:
                    r = geo_results[d]
                    geo_export_rows.append({
                        "tld": r.tld, "tld_country": r.tld_country, "ip_address": r.ip_address,
                        "server_country": r.server_country, "server_city": r.server_city,
                        "server_isp": r.server_isp, "content_lang": r.content_lang or r.content_lang_code,
                    })
                else:
                    geo_export_rows.append({"tld": "", "tld_country": "", "ip_address": "", "server_country": "", "server_city": "", "server_isp": "", "content_lang": ""})
            df_geo_extra = pd.DataFrame(geo_export_rows)
            df_export = pd.concat([df_export.reset_index(drop=True), df_geo_extra.reset_index(drop=True)], axis=1)

        col_display_export = {
            "domain": "Domaine", "http_status": "Status", "http_code": "Code",
            "response_time_ms": "Temps (ms)", "ad_count": "Nb pubs",
            "attention_score": "Score attention", "is_mfa": "MFA",
            "category": "Categorie", "ai_confidence": "Confiance IA",
            "action": "Action", "action_reason": "Raison",
        }
        if adtech_results:
            col_display_export.update({
                "adtech_gpt": "GPT", "adtech_prebid": "Prebid", "adtech_amazon": "Amazon TAM",
                "adtech_criteo": "Criteo", "adtech_teads": "Teads", "adtech_taboola": "Taboola",
                "adtech_outbrain": "Outbrain", "adtech_scripts": "Scripts ad-tech",
                "trackers_total": "Nb trackers", "page_load_ms": "Chargement (ms)",
            })
        if ads_txt_results:
            col_display_export.update({
                "ads_txt_present": "ads.txt", "ads_txt_sellers": "Nb sellers",
                "ads_txt_type": "Type vendeur", "ads_txt_top_ssps": "Top SSPs",
            })
        if geo_results:
            col_display_export.update({
                "tld": "TLD", "tld_country": "Pays TLD", "ip_address": "IP",
                "server_country": "Pays serveur", "server_city": "Ville",
                "server_isp": "ISP", "content_lang": "Langue",
            })

        with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
            export_cols = [c for c in col_display_export if c in df_export.columns]
            df_export[export_cols].rename(columns=col_display_export).to_excel(writer, sheet_name="Audit complet", index=False)
            df_rm = df_export[df_export["action"].isin(["remove_dead", "remove_mfa"])]
            if not df_rm.empty:
                df_rm[export_cols].rename(columns=col_display_export).to_excel(writer, sheet_name="A supprimer", index=False)
            df_keep = df_export[df_export["action"] == "keep"].sort_values("attention_score", ascending=False)
            if not df_keep.empty:
                df_keep[export_cols].rename(columns=col_display_export).to_excel(writer, sheet_name="Sites premium", index=False)

        date_str = datetime.now().strftime("%Y%m%d")
        st.download_button(
            "Telecharger Excel", data=excel_buffer.getvalue(),
            file_name=f"audit_{client_name}_{date_str}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )

    with dl_cols[1]:
        json_results = []
        for r in report.results:
            entry = r.to_flat_dict()
            d = r.domain
            if adtech_results and d in adtech_results:
                entry["adtech"] = adtech_results[d]
            if st.session_state.get("tracker_results") and d in st.session_state.get("tracker_results", {}):
                entry["trackers"] = st.session_state["tracker_results"][d]
            if st.session_state.get("load_times") and d in st.session_state.get("load_times", {}):
                entry["page_load_time_ms"] = st.session_state["load_times"][d]
            if ads_txt_results and d in ads_txt_results:
                entry.update(ads_txt_results[d].to_flat_dict())
            if geo_results and d in geo_results:
                entry.update(geo_results[d].to_flat_dict())
            json_results.append(entry)

        json_data = {
            "audit_date": report.audit_date,
            "client": client_name,
            "stats": {
                "total": report.total_sites, "alive": report.sites_alive,
                "dead": report.sites_dead, "mfa": report.sites_mfa,
                "flagged": report.sites_flagged, "avg_attention_score": report.avg_attention_score,
                "category_distribution": report.category_distribution,
            },
            "results": json_results,
        }
        date_str = datetime.now().strftime("%Y%m%d")
        st.download_button(
            "Telecharger JSON",
            data=json.dumps(json_data, ensure_ascii=False, indent=2, default=str),
            file_name=f"audit_{client_name}_{date_str}.json",
            mime="application/json", use_container_width=True,
        )

    with dl_cols[2]:
        clean_domains = [r.domain for r in report.results if r.action == CleanAction.KEEP]
        date_str = datetime.now().strftime("%Y%m%d")
        st.download_button(
            "Whitelist nettoyee (TXT)",
            data="\n".join(clean_domains),
            file_name=f"whitelist_clean_{client_name}_{date_str}.txt",
            mime="text/plain", use_container_width=True,
        )

    if screenshot_results and len(dl_cols) > 3:
        with dl_cols[3]:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                for domain_name, data in screenshot_results.items():
                    for key in ("viewport_path", "fullpage_path", "filepath"):
                        fpath = data.get(key, "")
                        if fpath and Path(fpath).exists():
                            zf.write(fpath, Path(fpath).name)
            date_str = datetime.now().strftime("%Y%m%d")
            st.download_button(
                "Screenshots (ZIP)",
                data=zip_buffer.getvalue(),
                file_name=f"screenshots_{client_name}_{date_str}.zip",
                mime="application/zip", use_container_width=True,
            )

    # ── Footer ───────────────────────────────────────────
    st.markdown(
        "<br><p class='mli-footer' style='text-align:center;'>"
        f"MLI v1.0 — Audit realise le {datetime.now().strftime('%d/%m/%Y a %H:%M')} — "
        f"Dentsu Programmatic Intelligence</p>",
        unsafe_allow_html=True,
    )
