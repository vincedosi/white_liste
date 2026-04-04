"""
MLI — Validation de la clé Mistral
"""
from __future__ import annotations


def validate_mistral_key(api_key: str) -> tuple[bool, str]:
    """
    Vérifie que la clé API Mistral est valide en faisant un appel minimal.

    Returns:
        (is_valid, message)
    """
    if not api_key or not api_key.strip():
        return False, "Clé API vide"

    api_key = api_key.strip()

    # Check format basique
    if len(api_key) < 20:
        return False, "Format de clé invalide (trop courte)"

    try:
        from mistralai.client import Mistral

        client = Mistral(api_key=api_key)
        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return True, "Clé valide — connexion Mistral OK"

    except Exception as e:
        error = str(e)
        if "401" in error or "Unauthorized" in error or "authentication" in error.lower():
            return False, "Clé invalide ou expirée — vérifiez sur console.mistral.ai"
        elif "429" in error:
            return True, "Clé valide (rate limit atteint, réessayez dans un instant)"
        else:
            return False, f"Erreur de connexion : {error[:150]}"
