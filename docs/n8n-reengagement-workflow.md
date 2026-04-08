# n8n Workflow: Follow-up Automatisé (Ré-engagement)

Workflow n8n pour identifier les utilisateurs inactifs (7+ jours) et leur envoyer un email de ré-engagement personnalisé avec rappel de leur roadmap.

---

## Prérequis

1. **n8n** installé (self-hosted ou cloud)
2. **API Subul** accessible avec les endpoints `/api/n8n/*`
3. **Service d'email** configuré (SendGrid, Resend, ou SMTP)
4. **Cosmos DB** activé sur Subul (pour stocker les sessions utilisateurs)

---

## Endpoints API Disponibles

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/n8n/health` | GET | Vérifie la connectivité |
| `/api/n8n/inactive-users?days=7` | GET | Liste les utilisateurs inactifs depuis N jours |
| `/api/n8n/record-email-sent` | POST | Enregistre l'envoi d'un email (tracking) |
| `/api/n8n/user/{user_id}/email-history` | GET | Historique des emails d'un utilisateur |

---

## Configuration du Workflow n8n

### Étape 1: Trigger Schedule

```
Node: Schedule Trigger
├── Mode: Every Week
├── Day: Friday
└── Time: 9:00 AM
```

### Étape 2: HTTP Request - Récupérer utilisateurs inactifs

```
Node: HTTP Request
├── Method: GET
├── URL: http://localhost:8002/api/n8n/inactive-users?days=7
├── Authentication: None (ou Bearer Token si protégé)
└── Response Format: JSON
```

**Réponse attendue:**
```json
{
  "users": [
    {
      "user_id": "user_123456",
      "last_session_date": "2024-01-15T10:30:00",
      "days_inactive": 7,
      "profile": "cloud",
      "level": "Intermédiaire",
      "roadmap_title": "Cloud Architect Azure",
      "completed_certs": ["AZ-900"]
    }
  ],
  "total": 1,
  "days_threshold": 7
}
```

### Étape 3: Split In Batches

```
Node: Split In Batches
├── Items Per Batch: 1
└── Continue: Always
```

Pour traiter chaque utilisateur individuellement.

### Étape 4: IF - Vérifier déjà contacté récemment

```
Node: IF
├── Condition: String
├── Value 1: {{ $json.user_id }}
├── Operation: Not Equal
└── Value 2: (récupérer via HTTP Request vers /email-history)
```

Optionnel: Vérifier si l'utilisateur a déjà reçu un email de ré-engagement cette semaine.

### Étape 5: HTTP Request - Vérifier historique emails

```
Node: HTTP Request
├── Method: GET
├── URL: http://localhost:8002/api/n8n/user/{{ $json.user_id }}/email-history
└── Continue On Fail: true
```

### Étape 6: Send Email (SendGrid/Resend)

**Template HTML personnalisé:**

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f5f3ff; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; }
        .header { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .roadmap-card { background: #f9fafb; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0; }
        .cta-button { background: #8b5cf6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>👋 On vous attend sur Subul !</h1>
        </div>
        <div class="content">
            <p>Bonjour,</p>
            <p>Vous avez commencé votre parcours <strong>{{ $json.profile }}</strong> il y a {{ $json.days_inactive }} jours...</p>
            
            <div class="roadmap-card">
                <h3>{{ $json.roadmap_title }}</h3>
                <p>Niveau: {{ $json.level }}</p>
                <p>Certifications déjà validées: {{ $json.completed_certs.join(', ') || 'Aucune encore' }}</p>
            </div>
            
            <p>Continuez là où vous vous êtes arrêté :</p>
            <a href="https://subul.app/continue?user={{ $json.user_id }}" class="cta-button">
                Reprendre mon parcours
            </a>
        </div>
    </div>
</body>
</html>
```

**Configuration SendGrid:**
```
Node: SendGrid
├── From: coaching@subul.app
├── To: {{ $json.user_id }}@placeholder.com (ou chercher l'email)
├── Subject: 🎯 Continuez votre roadmap {{ $json.roadmap_title }}
├── HTML Content: (template ci-dessus)
└── Attachments: None
```

### Étape 7: HTTP Request - Enregistrer l'envoi

```
Node: HTTP Request
├── Method: POST
├── URL: http://localhost:8002/api/n8n/record-email-sent
├── Body:
│   {
│     "user_id": "{{ $json.user_id }}",
│     "email_type": "reengagement",
│     "provider": "sendgrid",
│     "message_id": "{{ $node['SendGrid'].json.messageId }}",
│     "metadata": {
│       "days_inactive": {{ $json.days_inactive }},
│       "profile": "{{ $json.profile }}"
│     }
│   }
└── Continue On Fail: true
```

### Étape 8: Merge (optionnel)

```
Node: Merge
├── Mode: Wait for all
```

---

## Workflow JSON Export (à importer dans n8n)

```json
{
  "name": "Subul - Follow-up Automatisé",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{
            "field": "weeks",
            "value": 1
          }]
        }
      },
      "name": "Weekly Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "position": [250, 300]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "http://localhost:8002/api/n8n/inactive-users?days=7",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [{
            "name": "days",
            "value": "7"
          }]
        }
      },
      "name": "Get Inactive Users",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300]
    }
  ]
}
```

---

## Variantes de Workflows

### 1. Rappel Quotidien (D-1 avant objectif)

```
Schedule: Daily 8am
GET /api/n8n/inactive-users?days=6  # Objectif à J+7
Email: "Votre objectif approche !"
```

### 2. Félicitations (certification validée)

```
Trigger: Webhook depuis frontend quand cert marquée "completed"
POST /api/n8n/record-email-sent
Email: "🎉 Félicitations pour votre AZ-900 !"
```

### 3. Recommandation mensuelle

```
Schedule: Monthly
GET /progress/{user_id}
Analyse des écarts
Email avec certifications suggérées
```

---

## Monitoring & Logs

### Vérifier que ça marche

```bash
# 1. Test endpoint
curl http://localhost:8002/api/n8n/health

# 2. Voir utilisateurs inactifs
curl "http://localhost:8002/api/n8n/inactive-users?days=7"

# 3. Vérifier historique email
curl http://localhost:8002/api/n8n/user/user_123/email-history
```

### Logs Cosmos DB

Les emails envoyés sont stockés dans le document utilisateur:

```json
{
  "id": "roadmap_user_123",
  "type": "roadmap_session",
  "email_history": [
    {
      "type": "email_sent",
      "email_type": "reengagement",
      "sent_at": "2024-01-22T09:00:00",
      "provider": "sendgrid"
    }
  ],
  "last_email_sent": "2024-01-22T09:00:00"
}
```

---

## Dépannage

| Problème | Solution |
|----------|----------|
| `503 Cosmos DB not available` | Vérifier `.env` Azure Cosmos credentials |
| `0 inactive users` | Normal si tous les utilisateurs sont actifs |
| Emails en double | Vérifier le IF condition avant envoi |
| n8n ne voit pas l'API | Vérifier CORS + firewall sur port 8002 |

---

## Sécurité

1. **Protéger les endpoints n8n** avec API key si exposés sur internet
2. **Limiter les jours** (max 90) pour éviter les requêtes trop lourdes
3. **Rate limiting** sur SendGrid pour éviter le spam
4. **Unsubscribe** link obligatoire dans les emails

---

## Prochaines Améliorations

- [ ] Endpoint `/api/n8n/user/{id}/email` pour récupérer l'email réel (via table users)
- [ ] Template dynamique selon le profil (cloud/cyber/ai/iot)
- [ ] A/B testing des sujets d'email via n8n
- [ ] Intégration WhatsApp/Telegram pour les rappels
