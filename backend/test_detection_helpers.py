import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from services.detection_helpers import (
    is_content_sufficient, detect_video_ad_domains,
    compute_video_ad_units, video_penalty, combine_scores,
    dedup_nested_ads, score_from_penalty,
)

VIDEO_DOMAINS = ["imasdk.googleapis.com", "freewheel.com", "spotx.tv"]
VIDEO_HINTS = ["/pubads", "vast", "vmap"]


def test_blank_page_is_not_sufficient():
    assert is_content_sufficient(0, 3) is False

def test_real_page_is_sufficient():
    assert is_content_sufficient(5000, 800) is True

def test_borderline_text_only_not_enough():
    assert is_content_sufficient(50, 800) is False

def test_detect_video_domain():
    urls = ["https://imasdk.googleapis.com/js/sdkloader/ima3.js", "https://x.fr/article"]
    assert "imasdk.googleapis.com" in detect_video_ad_domains(urls, VIDEO_DOMAINS, VIDEO_HINTS)

def test_detect_vast_endpoint():
    urls = ["https://pubads.g.doubleclick.net/gampad/ads?vast=1"]
    assert "vast-endpoint" in detect_video_ad_domains(urls, VIDEO_DOMAINS, VIDEO_HINTS)

def test_no_video_signal():
    assert detect_video_ad_domains(["https://x.fr/"], VIDEO_DOMAINS, VIDEO_HINTS) == []

def test_video_units_player_plus_infra():
    assert compute_video_ad_units(True, ["freewheel.com"]) == 1
    assert compute_video_ad_units(True, ["freewheel.com", "spotx.tv", "imasdk.googleapis.com"]) == 3

def test_video_units_capped():
    assert compute_video_ad_units(True, ["a","b","c","d","e","f"]) == 4

def test_video_units_infra_no_player():
    assert compute_video_ad_units(False, ["freewheel.com"]) == 0
    assert compute_video_ad_units(False, ["freewheel.com","spotx.tv"]) == 1

def test_video_units_none():
    assert compute_video_ad_units(True, []) == 0

def test_video_units_vast_endpoint_counts_without_player():
    # A confirmed VAST call is reliable evidence even without a <video> element.
    assert compute_video_ad_units(False, ["vast-endpoint"]) == 1
    assert compute_video_ad_units(False, ["vast-endpoint", "freewheel.com"]) == 2

def test_video_penalty():
    assert video_penalty(2) == 3.0

def test_combine_takes_minimum():
    assert combine_scores(10.0, 6.4) == 6.4

def test_combine_handles_none():
    assert combine_scores(None, 6.4) == 6.4
    assert combine_scores(10.0, None) == 10.0
    assert combine_scores(None, None) is None

def test_dedup_nested_removes_child():
    ads = [
        {"x": 0, "y": 0, "width": 300, "height": 250},    # parent
        {"x": 10, "y": 10, "width": 100, "height": 80},   # child inside parent
        {"x": 400, "y": 0, "width": 300, "height": 250},  # separate
    ]
    assert len(dedup_nested_ads(ads)) == 2

def test_dedup_keeps_separate():
    ads = [{"x": 0, "y": 0, "width": 100, "height": 100},
           {"x": 200, "y": 0, "width": 100, "height": 100}]
    assert len(dedup_nested_ads(ads)) == 2

def test_score_from_penalty_zero_is_ten():
    assert score_from_penalty(0) == 10.0

def test_score_from_penalty_monotonic():
    assert score_from_penalty(2) > score_from_penalty(6) > score_from_penalty(15)

def test_score_from_penalty_bounded():
    assert 0.0 <= score_from_penalty(100) <= 10.0
