"""
MLI Crawler — Pydantic Models for FastAPI
Converted from dataclasses to Pydantic BaseModel.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────

class SiteStatus(str, Enum):
    OK = "ok"
    REDIRECT = "redirect"
    CLIENT_ERROR = "client_error"
    SERVER_ERROR = "server_error"
    TIMEOUT = "timeout"
    DNS_ERROR = "dns_error"
    SSL_ERROR = "ssl_error"
    CONNECTION_ERROR = "connection_error"


class CleanAction(str, Enum):
    KEEP = "keep"
    REMOVE_DEAD = "remove_dead"
    REMOVE_MFA = "remove_mfa"
    FLAG_LOW_ATTENTION = "flag_low_attention"


# ── Request / Event Models ───────────────────────────────

class AuditModules(BaseModel):
    attention: bool = True
    ads_txt: bool = True
    geo: bool = True
    categorization: bool = True
    screenshots: bool = True


class AuditRequest(BaseModel):
    domains: list[str]
    client: str = ""
    modules: AuditModules = Field(default_factory=AuditModules)


class AuditEvent(BaseModel):
    event: str  # "log", "step", "complete"
    data: dict[str, Any] = Field(default_factory=dict)


# ── Result Models ────────────────────────────────────────

class HealthResult(BaseModel):
    status: SiteStatus = SiteStatus.TIMEOUT
    http_code: int | None = None
    response_time_ms: int | None = None
    final_url: str | None = None
    error_message: str | None = None

    @property
    def is_alive(self) -> bool:
        """A site is alive if the server responds, even with 4xx (bot protection, paywalls)."""
        if self.status in (SiteStatus.OK, SiteStatus.REDIRECT, SiteStatus.CLIENT_ERROR):
            return True
        # Server error (5xx) — server is up but broken, still try to crawl
        if self.status == SiteStatus.SERVER_ERROR:
            return True
        return False


class AttentionResult(BaseModel):
    ad_count: int = 0
    score: float | None = None  # None = not scored (dead site)
    is_mfa: bool = False
    details: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class CategoryResult(BaseModel):
    category: str = "Autre"
    confidence: float = 0.0
    raw_response: str | None = None
    error: str | None = None


class SiteAudit(BaseModel):
    domain: str
    url: str = ""
    timestamp: str = ""

    health: HealthResult = Field(default_factory=lambda: HealthResult(status=SiteStatus.TIMEOUT))
    attention: AttentionResult = Field(default_factory=AttentionResult)
    categorization: CategoryResult = Field(default_factory=CategoryResult)

    action: CleanAction = CleanAction.KEEP
    action_reason: str = ""

    # Optional enrichment fields
    ads_txt: dict[str, Any] | None = None
    geo: dict[str, Any] | None = None
    adtech: dict[str, Any] | None = None
    trackers: dict[str, Any] | None = None
    load_time_ms: int | None = None
    screenshots: dict[str, Any] | None = None

    def model_post_init(self, __context: Any) -> None:
        if not self.url:
            self.url = f"https://{self.domain}"
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()

    def decide_action(self) -> None:
        """Apply business rules to decide keep/remove/flag."""
        if not self.health.is_alive:
            self.action = CleanAction.REMOVE_DEAD
            self.action_reason = f"{self.health.status.value} (HTTP {self.health.http_code or 'N/A'})"
            # Dead sites have no score
            self.attention = AttentionResult(score=None, ad_count=0, is_mfa=False)
        elif self.attention.is_mfa:
            self.action = CleanAction.REMOVE_MFA
            self.action_reason = f"MFA detected -- {self.attention.ad_count} ads, score {self.attention.score:.1f}/10"
        elif self.attention.score is not None and self.attention.score < 6.0:
            self.action = CleanAction.FLAG_LOW_ATTENTION
            self.action_reason = f"Low attention -- score {self.attention.score:.1f}/10"
        else:
            self.action = CleanAction.KEEP
            self.action_reason = ""

    def to_flat_dict(self) -> dict:
        """Flat version for Excel export."""
        return {
            "domain": self.domain,
            "url": self.url,
            "http_status": self.health.status.value,
            "http_code": self.health.http_code,
            "response_time_ms": self.health.response_time_ms,
            "final_url": self.health.final_url,
            "is_alive": self.health.is_alive,
            "ad_count": self.attention.ad_count,
            "attention_score": round(self.attention.score, 1) if self.attention.score is not None else None,
            "is_mfa": self.attention.is_mfa,
            "category": self.categorization.category,
            "ai_confidence": round(self.categorization.confidence, 2),
            "action": self.action.value,
            "action_reason": self.action_reason,
            "audited_at": self.timestamp,
        }


class AuditReport(BaseModel):
    audit_id: str = ""
    audit_date: str = ""
    client_name: str = ""
    total_sites: int = 0
    sites_alive: int = 0
    sites_dead: int = 0
    sites_mfa: int = 0
    sites_flagged: int = 0
    avg_attention_score: float = 0.0
    category_distribution: dict[str, int] = Field(default_factory=dict)
    results: list[SiteAudit] = Field(default_factory=list)

    def compute_stats(self) -> None:
        self.audit_date = datetime.now().isoformat()
        self.total_sites = len(self.results)
        self.sites_alive = sum(1 for r in self.results if r.health.is_alive)
        self.sites_dead = sum(1 for r in self.results if r.action == CleanAction.REMOVE_DEAD)
        self.sites_mfa = sum(1 for r in self.results if r.action == CleanAction.REMOVE_MFA)
        self.sites_flagged = sum(1 for r in self.results if r.action == CleanAction.FLAG_LOW_ATTENTION)

        alive_scores = [r.attention.score for r in self.results if r.health.is_alive and r.attention.score is not None]
        self.avg_attention_score = round(
            sum(alive_scores) / len(alive_scores), 1
        ) if alive_scores else 0.0

        cats: dict[str, int] = {}
        for r in self.results:
            if r.health.is_alive:
                cats[r.categorization.category] = cats.get(r.categorization.category, 0) + 1
        self.category_distribution = dict(sorted(cats.items(), key=lambda x: x[1], reverse=True))


# ── Workspace & Auth models ──────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class WorkspaceConfig(BaseModel):
    modules: AuditModules = AuditModules()
    mfa_threshold: float = 4.0
    mistral_key_encrypted: str | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_path: str | None = None
    config: WorkspaceConfig = WorkspaceConfig()
    onboarding_done: bool = False
    created_by: str
    created_at: str
    member_count: int = 0
    audit_count: int = 0


class WorkspaceCreateRequest(BaseModel):
    name: str
    slug: str | None = None


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = None
    config: WorkspaceConfig | None = None


class MemberOut(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    joined_at: str


class InviteRequest(BaseModel):
    email: str
    role: str = "editor"


class WhitelistOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    domains: list[str] = []
    created_by: str
    created_at: str
    updated_at: str


class WhitelistCreateRequest(BaseModel):
    name: str
    domains: list[str]


class ActivityOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    user_name: str | None = None
    action: str
    detail: dict | None = None
    created_at: str
