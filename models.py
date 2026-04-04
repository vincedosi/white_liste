"""
MLI Crawler — Modèles de données
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
import json


class SiteStatus(str, Enum):
    OK = "ok"
    REDIRECT = "redirect"
    CLIENT_ERROR = "client_error"  # 4xx
    SERVER_ERROR = "server_error"  # 5xx
    TIMEOUT = "timeout"
    DNS_ERROR = "dns_error"
    SSL_ERROR = "ssl_error"
    CONNECTION_ERROR = "connection_error"


class CleanAction(str, Enum):
    KEEP = "keep"
    REMOVE_DEAD = "remove_dead"
    REMOVE_MFA = "remove_mfa"
    FLAG_LOW_ATTENTION = "flag_low_attention"


@dataclass
class HealthResult:
    status: SiteStatus
    http_code: int | None = None
    response_time_ms: int | None = None
    final_url: str | None = None  # après redirections
    error_message: str | None = None

    @property
    def is_alive(self) -> bool:
        return self.status in (SiteStatus.OK, SiteStatus.REDIRECT)


@dataclass
class AttentionResult:
    ad_count: int = 0
    score: float = 10.0  # 0-10, 10 = parfait
    is_mfa: bool = False
    details: dict = field(default_factory=dict)  # comptage par type de selector
    error: str | None = None


@dataclass
class CategoryResult:
    category: str = "Autre"
    confidence: float = 0.0
    raw_response: str | None = None
    error: str | None = None


@dataclass
class SiteAudit:
    domain: str
    url: str = ""
    timestamp: str = ""

    # Résultats des 3 modules
    health: HealthResult = field(default_factory=lambda: HealthResult(status=SiteStatus.TIMEOUT))
    attention: AttentionResult = field(default_factory=AttentionResult)
    categorization: CategoryResult = field(default_factory=CategoryResult)

    # Décision finale
    action: CleanAction = CleanAction.KEEP
    action_reason: str = ""

    def __post_init__(self):
        if not self.url:
            self.url = f"https://{self.domain}"
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()

    def decide_action(self) -> None:
        """Applique les règles métier pour décider keep/remove/flag."""
        if not self.health.is_alive:
            self.action = CleanAction.REMOVE_DEAD
            self.action_reason = f"{self.health.status.value} (HTTP {self.health.http_code or 'N/A'})"
        elif self.attention.is_mfa:
            self.action = CleanAction.REMOVE_MFA
            self.action_reason = f"MFA détecté — {self.attention.ad_count} pubs, score {self.attention.score:.1f}/10"
        elif self.attention.score < 6.0:
            self.action = CleanAction.FLAG_LOW_ATTENTION
            self.action_reason = f"Attention faible — score {self.attention.score:.1f}/10"
        else:
            self.action = CleanAction.KEEP
            self.action_reason = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def to_flat_dict(self) -> dict:
        """Version aplatie pour export Excel."""
        return {
            "domain": self.domain,
            "url": self.url,
            "http_status": self.health.status.value,
            "http_code": self.health.http_code,
            "response_time_ms": self.health.response_time_ms,
            "final_url": self.health.final_url,
            "is_alive": self.health.is_alive,
            "ad_count": self.attention.ad_count,
            "attention_score": round(self.attention.score, 1),
            "is_mfa": self.attention.is_mfa,
            "category": self.categorization.category,
            "ai_confidence": round(self.categorization.confidence, 2),
            "action": self.action.value,
            "action_reason": self.action_reason,
            "audited_at": self.timestamp,
        }


@dataclass
class AuditReport:
    """Rapport global d'un audit complet."""
    audit_date: str = ""
    total_sites: int = 0
    sites_alive: int = 0
    sites_dead: int = 0
    sites_mfa: int = 0
    sites_flagged: int = 0
    avg_attention_score: float = 0.0
    category_distribution: dict = field(default_factory=dict)
    results: list[SiteAudit] = field(default_factory=list)

    def compute_stats(self) -> None:
        self.audit_date = datetime.now().isoformat()
        self.total_sites = len(self.results)
        self.sites_alive = sum(1 for r in self.results if r.health.is_alive)
        self.sites_dead = sum(1 for r in self.results if r.action == CleanAction.REMOVE_DEAD)
        self.sites_mfa = sum(1 for r in self.results if r.action == CleanAction.REMOVE_MFA)
        self.sites_flagged = sum(1 for r in self.results if r.action == CleanAction.FLAG_LOW_ATTENTION)

        alive_scores = [r.attention.score for r in self.results if r.health.is_alive]
        self.avg_attention_score = round(sum(alive_scores) / len(alive_scores), 1) if alive_scores else 0.0

        cats: dict[str, int] = {}
        for r in self.results:
            if r.health.is_alive:
                cats[r.categorization.category] = cats.get(r.categorization.category, 0) + 1
        self.category_distribution = dict(sorted(cats.items(), key=lambda x: x[1], reverse=True))

    def to_json(self, path: str) -> None:
        data = {
            "audit_date": self.audit_date,
            "stats": {
                "total": self.total_sites,
                "alive": self.sites_alive,
                "dead": self.sites_dead,
                "mfa": self.sites_mfa,
                "flagged": self.sites_flagged,
                "avg_attention_score": self.avg_attention_score,
                "category_distribution": self.category_distribution,
            },
            "results": [r.to_dict() for r in self.results],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
