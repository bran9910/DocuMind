# Prompts Grok API Complets

> Prompts prêts à copier-coller pour l'API Grok (xAI)

---

## 1. PROMPT - ANALYSE DE DOCUMENTS (PDF/DOCX)

### Pour Documents Courts (< 4000 tokens)

```
Tu es un analyste de documents senior. Analyse ce document et produis un rapport structuré.

DOCUMENT :
{{document_text}}

METADONNÉES :
- Nom fichier : {{file_name}}
- Type : {{file_type}}
- Langue demandée : {{language}}

INSTRUCTIONS :
1. Fournis un résumé exécutif concis (3-4 phrases)
2. Extrais les points clés avec données chiffrées si présentes
3. Identifie 2-3 insights non évidents
4. Évalue la qualité de l'information
5. Réponds UNIQUEMENT en {{language}}

FORMAT DE RÉPONSE (JSON VALIDE) :
{
  "executive_summary": "string",
  "key_points": ["point 1", "point 2", "point 3"],
  "insights": ["insight 1", "insight 2"],
  "document_type": "type détecté",
  "target_audience": "public cible",
  "quality_score": "1-10",
  "word_count": N,
  "entities_detected": ["entreprises", "personnes", "dates clés"]
}
```

### Pour Documents Longs (> 4000 tokens)

```
Tu es un analyste de documents senior. Analyse ce document par sections.

DOCUMENT (PARTIE {{chunk_number}}/{{total_chunks}}) :
{{document_text}}

CONTEXTE : Document de {{total_pages}} pages, partie {{chunk_number}} sur {{total_chunks}}

INSTRUCTIONS :
1. Résume cette section en 2-3 phrases
2. Identifie les thèmes principaux
3. Note les données chiffrées importantes
4. Signale les connexions avec d'autres sections si évidentes

FORMAT (JSON) :
{
  "section_summary": "string",
  "themes": ["theme1", "theme2"],
  "key_data": ["donnée1", "donnée2"],
  "cross_references": ["lien potentiel"]
}
```

---

## 2. PROMPT - ANALYSE DE DONNÉES (XLSX/CSV)

### Analyse Automatique Style DataLens

```
Tu es un data analyst senior. Analyse ce dataset et produis un rapport complet style DataLens.

DONNÉES JSON :
{{data_json}}

INSTRUCTIONS :
1. Analyse automatique sans hypothèse préalable
2. Détecte les tendances, anomalies, corrélations
3. Propose des graphiques pertinents
4. Fournis un rapport complet en sections

FORMAT JSON REQUIS :
{
  "overview": {
    "rows": N,
    "columns": N,
    "period": "description temporelle",
    "data_quality": "score 1-10",
    "completeness": "pourcentage"
  },
  "statistics": {
    "column_name": {
      "type": "numeric|categorical|date|text",
      "count": N,
      "unique": N,
      "nulls": N,
      "mean": X,
      "median": X,
      "std": X,
      "min": X,
      "max": X,
      "insight": "observation clé"
    }
  },
  "detections": {
    "trends": ["description tendance 1", "tendance 2"],
    "anomalies": ["anomalie 1", "anomalie 2"],
    "correlations": ["corrélation forte entre X et Y"],
    "patterns": ["pattern 1", "pattern 2"],
    "seasonality": "détection saisonnalité"
  },
  "charts_recommended": [
    {
      "type": "line|bar|scatter|pie|heatmap|histogram",
      "title": "titre du graphique",
      "x_axis": "colonne X",
      "y_axis": "colonne Y",
      "insight": "ce que ce graphique montre",
      "priority": "high|medium|low"
    }
  ],
  "executive_summary": "3-4 phrases synthétiques",
  "key_findings": ["finding 1", "finding 2", "finding 3"],
  "recommendations": ["reco 1", "reco 2"],
  "confidence_score": "1-10"
}

Réponds UNIQUEMENT avec ce JSON, sans markdown, sans explications supplémentaires.
```

---

## 3. PROMPT - ANALYSE PERSONNALISÉE

### Construction Dynamique

```
Tu es un analyste de données senior spécialisé en {{analysis_type}}.

FICHIER À ANALYSER :
Nom: {{file_name}}
Type: {{file_type}}
Données extraites: {{data_json}}

PRÉFÉRENCES UTILISATEUR :
- Objectif d'analyse: {{analysis_objective}}
- Variables cibles: {{target_variables}}
- Dimensions de comparaison: {{comparison_dimensions}}
- Préférence visuelle: {{visualization_preference}}
- Focus spécifique: {{specific_insights}}
- Langue: {{language}}

INSTRUCTIONS SPÉCIFIQUES :
1. Adapte ton analyse STRICTEMENT aux préférences ci-dessus
2. Ne fournis PAS de graphiques - seulement des suggestions avec données
3. Structure ta réponse en sections claires
4. Privilégie l'actionnable et le concret
5. Réponds en {{language}}

FORMAT JSON ATTENDU :
{
  "executive_summary": "3-4 phrases synthétiques",
  "key_findings": ["finding 1", "finding 2"],
  "detailed_analysis": {
    "section1_name": "contenu détaillé",
    "section2_name": "contenu détaillé"
  },
  "chart_suggestions": [
    {
      "type": "line|bar|scatter|pie",
      "title": "titre",
      "data_description": "données à utiliser",
      "insight_expected": "ce que ça montre"
    }
  ],
  "recommendations": ["reco 1", "reco 2"],
  "confidence_score": "1-10",
  "limitations": ["limite 1", "limite 2"],
  "next_steps": ["étape suggérée 1", "étape 2"]
}
```

---

## 4. PROMPT - GÉNÉRATION DE SYNTHÈSE FINALE

### Pour Rapport Complet

```
Tu es un rédacteur de rapports d'analyse. Crée une synthèse finale professionnelle.

ANALYSE PRÉCÉDENTE :
{{previous_analysis_json}}

TYPE DE RAPPORT : {{report_type}}
PUBLIC CIBLE : {{target_audience}}

INSTRUCTIONS :
1. Reformule les découvertes en langage accessible
2. Hiérarchise les informations par importance
3. Ajoute une section "Pour aller plus loin"
4. Termine par un call-to-action clair

FORMAT (Markdown structuré) :
# Synthèse Exécutive
[Bref résumé]

# Points Clés
- Point 1
- Point 2

# Recommandations Prioritaires
1. Reco principale
2. Reco secondaire

# Prochaines Étapes
[Actions concrètes]
```

---

## 5. CONFIGURATION API GROK

### Paramètres Recommandés

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| `model` | `grok-3` | Meilleur rapport qualité/coût |
| `temperature` | `0.3` | Réponses factuelles, moins créatives |
| `max_tokens` | `4000` | Limite pour réponses complètes |
| `top_p` | `0.9` | Diversité contrôlée |
| `frequency_penalty` | `0` | Pas de pénalité répétition |
| `presence_penalty` | `0` | Pas de pénalité thématique |

### En-têtes HTTP

```javascript
{
  "Authorization": "Bearer YOUR_GROK_API_KEY",
  "Content-Type": "application/json"
}
```

### Corps de Requête

```javascript
{
  "model": "grok-3",
  "messages": [
    {
      "role": "system",
      "content": "Tu es un analyste expert. Réponds uniquement avec le format demandé, sans markdown additionnel."
    },
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ],
  "temperature": 0.3,
  "max_tokens": 4000
}
```

---

## 6. GESTION DES ERREURS

### Si Réponse Non-JSON

```
Si tu ne peux pas produire un JSON valide, réponds EXACTEMENT :
{
  "error": true,
  "error_type": "parsing_failed|insufficient_data|ambiguous_request",
  "message": "description du problème",
  "suggestion": "ce que l'utilisateur devrait faire"
}
```

### Si Données Insuffisantes

```
Si les données sont insuffisantes pour une analyse :
{
  "error": true,
  "error_type": "insufficient_data",
  "message": "Le fichier ne contient pas assez de données pour une analyse significative",
  "minimum_required": "X lignes minimum recommandées",
  "current": "Y lignes détectées",
  "suggestion": "Ajoutez plus de données ou envoyez un fichier différent"
}
```

---

## 7. EXEMPLES DE RÉPONSES ATTENDUES

### Exemple - Analyse Données Ventes

```json
{
  "overview": {
    "rows": 1247,
    "columns": 8,
    "period": "Janvier 2023 - Décembre 2024",
    "data_quality": "8.5",
    "completeness": "94%"
  },
  "statistics": {
    "Ventes": {
      "type": "numeric",
      "count": 1247,
      "mean": 15420,
      "median": 14200,
      "std": 8540,
      "min": 3200,
      "max": 45800,
      "insight": "Distribution normale avec 2% de valeurs extrêmes"
    }
  },
  "detections": {
    "trends": ["Croissance +23% sur 2024", "Pic saisonnier Q4"],
    "anomalies": ["5 outliers sur Ventes >3σ", "Baisse inhabituelle Mars 2024"],
    "correlations": ["Corrélation forte Ventes/Profit r=0.89"],
    "patterns": ["Croissance constante sauf pandémie"]
  },
  "charts_recommended": [
    {
      "type": "line",
      "title": "Évolution Ventes Mensuelles",
      "x_axis": "Mois",
      "y_axis": "Ventes",
      "insight": "Montre la tendance générale + saisonnalité",
      "priority": "high"
    },
    {
      "type": "scatter",
      "title": "Corrélation Ventes-Profit",
      "x_axis": "Ventes",
      "y_axis": "Profit",
      "insight": "Relation linéaire forte, points aberrants visibles",
      "priority": "high"
    }
  ],
  "executive_summary": "Les données révèlent une croissance soutenue de 23% sur 2024, avec une saisonnalité marquée en fin d'année. La corrélation Ventes-Profit (r=0.89) indique une gestion efficace des marges.",
  "key_findings": [
    "Croissance +23% année sur année",
    "5 outliers nécessitent investigation",
    "Région Sud sous-performe de 15%"
  ],
  "recommendations": [
    "Investiguer les 5 valeurs aberrantes",
    "Analyse approfondie région Sud",
    "Préparer forecast Q1 2025"
  ],
  "confidence_score": "8"
}
```

---

## 8. UTILISATION DANS N8N

### Node HTTP Request - Configuration Complète

```json
{
  "method": "POST",
  "url": "https://api.x.ai/v1/chat/completions",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "sendBody": true,
  "bodyParameters": {
    "parameters": [
      {
        "name": "model",
        "value": "grok-3"
      },
      {
        "name": "messages",
        "value": "=[{\"role\": \"system\", \"content\": \"Tu es un analyste expert. Réponds uniquement avec le JSON demandé.\"}, {\"role\": \"user\", \"content\": $json.prompt}]"
      },
      {
        "name": "temperature",
        "value": "0.3"
      },
      {
        "name": "max_tokens",
        "value": "4000"
      }
    ]
  },
  "options": {
    "timeout": 60000
  }
}
```

---

*Prompts prêts à utiliser - Dernière mise à jour : Avril 2026*
