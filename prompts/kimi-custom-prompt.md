# kimi-custom-prompt.md — Prompt Analyse Personnalisée
> Sprint 2.4 — 8 avril 2026  
> LLM : Ollama kimi-k2.5:cloud via Basic LLM Chain

---

## Usage

Ce prompt est **généré dynamiquement** par le node "Build Custom Prompt" (NODE 10 dans WF-04-custom-nodes-Q5-analysis.txt).  
Il injecte les 5 réponses de l'utilisateur + les données du fichier.

---

## Template Français (FR)

```
Tu es un expert data analyst. Analyse ce fichier {fileType} selon les exigences spécifiques de l'utilisateur.

INFORMATIONS FICHIER :
- Nom : {fileName}
- Type : {fileType}

EXIGENCES UTILISATEUR :
1. Objectif principal : {answers.q1}
2. Colonnes/sections ciblées : {answers.q2}
3. Période ou filtre : {answers.q3}
4. Type de livrable : {answers.q4}
5. Audience cible : {answers.q5}

DONNÉES DU FICHIER (tronquées à 8000 caractères) :
{fileData}

FORMAT DE SORTIE OBLIGATOIRE (JSON valide uniquement, sans markdown, sans texte hors JSON) :
{
  "resume_executif": "Résumé concis répondant à l'objectif principal (3-5 phrases)",
  "analyse_ciblee": {
    "points_cles": ["point 1", "point 2", "point 3"],
    "tendances_detectees": ["tendance 1", "tendance 2"],
    "anomalies": ["anomalie 1 (ou 'Aucune détectée')"]
  },
  "insights": ["insight 1", "insight 2", "insight 3"],
  "recommandations": ["recommandation 1", "recommandation 2", "recommandation 3"],
  "adaptation_audience": "Comment cette analyse est adaptée pour l'audience cible",
  "score_qualite_donnees": "1-10",
  "limites": "Toute limitation des données ou information manquante"
}
```

---

## Template English (ENG)

```
You are an expert data analyst. Analyze this {fileType} file according to the user's specific requirements.

FILE INFORMATION:
- File name: {fileName}
- Type: {fileType}

USER REQUIREMENTS:
1. Main goal: {answers.q1}
2. Focus columns/sections: {answers.q2}
3. Time period or filter: {answers.q3}
4. Output type: {answers.q4}
5. Target audience: {answers.q5}

FILE DATA (truncated to 8000 chars):
{fileData}

MANDATORY OUTPUT FORMAT (valid JSON only, no markdown, no explanation outside JSON):
{
  "executive_summary": "Concise summary addressing the main goal (3-5 sentences)",
  "focused_analysis": {
    "key_findings": ["finding 1", "finding 2", "finding 3"],
    "patterns_detected": ["pattern 1", "pattern 2"],
    "anomalies": ["anomaly 1 (or 'None detected')"]
  },
  "insights": ["insight 1", "insight 2", "insight 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "audience_adaptation": "How this analysis is tailored for the target audience",
  "data_quality_score": "1-10",
  "limitations": "Any data limitation or missing information"
}
```

---

## Paramètres Ollama recommandés

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| temperature | 0.3 | Analyses factuelles, peu de créativité |
| max_tokens | 4000 | Rapport complet avec toutes les sections |
| num_ctx | 8192 | Contexte suffisant pour données + prompt |
| format | — | Pas de `format: json` ici — Basic LLM Chain gère |

---

## Cas de test recommandés (Sprint 2.5)

| # | Fichier | Q1 | Q4 | Q5 |
|---|---------|----|----|-----|
| 1 | CSV ventes | Tendances Q1 2024 | Insights | Direction |
| 2 | XLSX RH | Turnover 2023 | Recommandations | DRH |
| 3 | PDF rapport annuel | Points financiers clés | Résumé | Client externe |

---

## Notes importantes

- **Ne jamais appeler Groq gpt-oss-120b** — incompatible JSON structuré (issue LangChain #34155)
- Si `extracted_data` est vide → utiliser `extracted_preview` comme fallback
- Tronquer `fileData` à 8000 chars max pour éviter dépassement contexte kimi
- Double parsing JSON (direct + regex) dans Parse Custom Response pour fiabilité
