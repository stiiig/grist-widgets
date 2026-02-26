# Magic Link — Fiche candidat (mode REST)

## Contexte

Les widgets EMILE tournent normalement dans un **iframe Grist** (mode plugin). Le magic link permet d'accéder à la fiche d'un candidat depuis une **URL publique**, sans iframe, pour partage externe (email, SMS…).

```
https://stiiig.github.io/grist-widgets/widgets/emile/fiche-candidat?rowId=42
```

---

## Architecture

```
Navigateur (GitHub Pages)
    │
    │  GET ?rowId=42
    ▼
src/app/widgets/emile/fiche-candidat/page.tsx
    │  détecte mode "rest" (pas d'iframe)
    │  appelle fetchSingleRowRest("CANDIDATS", 42)
    ▼
src/lib/grist/rest.ts
    │  construit l'URL du proxy n8n
    │  GET https://n8n.incubateur.../webhook/grist?table=CANDIDATS&filter={"id":[42]}
    ▼
n8n webhook (server-side, pas de CORS)
    │  Authorization: Bearer <clé API Grist>
    │  GET https://grist.incubateur.dnum.din.developpement-durable.gouv.fr
    │       /api/docs/75GHATRaKvHSmx3FRqCi4f/tables/CANDIDATS/records?filter=...
    ▼
Grist (instance interne)
    │  retourne {"records": [{id: 42, fields: {...}}]}
    ▼
n8n → répond au navigateur avec Access-Control-Allow-Origin: *
    ▼
page.tsx → affiche le dossier candidat
```

### Pourquoi ce proxy ?

`docs.getgrist.com` (et l'instance interne Grist) ne renvoie **pas** les headers CORS nécessaires pour les appels JavaScript cross-origin. Le navigateur bloque donc toute requête directe.

n8n appelle Grist **côté serveur** (pas de restriction CORS) et renvoie le résultat avec `Access-Control-Allow-Origin: *`.

Avantage bonus : la **clé API Grist ne transit jamais dans le bundle JavaScript** (elle reste dans n8n).

---

## Fichiers concernés

### `src/lib/grist/init.ts`

Détermine le mode de fonctionnement au démarrage :

| Mode | Condition | Usage |
|------|-----------|-------|
| `grist` | Dans un iframe Grist | Widget embarqué dans Grist |
| `mock` | `window.__GRIST_MOCK__` présent | Dev / harness |
| `rest` | `NEXT_PUBLIC_GRIST_PROXY_URL` défini au build | Magic link standalone |
| `none` | Aucune condition | Page ouverte hors contexte |

Le mode `rest` est activé si et seulement si la variable d'environnement `NEXT_PUBLIC_GRIST_PROXY_URL` est définie dans le bundle.

### `src/lib/grist/rest.ts`

Implémente l'interface `GristDocAPI` via le proxy n8n :

- `fetchTable(tableId)` → `GET /webhook/grist?table=TABLE`
- `fetchSingleRowRest(tableId, rowId)` → `GET /webhook/grist?table=TABLE&filter={"id":[rowId]}`
- `applyUserActions([["UpdateRecord", table, rowId, fields]])` → `PATCH /webhook/grist?table=TABLE`

### `src/lib/grist/hooks.ts`

`useGristInit` : charge `grist-plugin-api.js` **uniquement si on est dans un iframe** (`window.self !== window.top`). En mode standalone, ce script n'est jamais chargé.

### `src/app/widgets/emile/fiche-candidat/page.tsx`

- Lit `?rowId=` dans l'URL au montage du composant
- En mode `rest` + `rowIdFromUrl` → appelle `fetchSingleRowRest`
- Masque la barre de recherche candidat et la FAQ (inutiles hors Grist)
- Le bouton "Enregistrer" appelle `applyUserActions` → PATCH via proxy

---

## Workflow n8n

**URL du webhook (production) :**
```
https://n8n.incubateur.dnum.din.developpement-durable.gouv.fr/webhook/grist
```

### Nœud 1 — Webhook
| Paramètre | Valeur |
|-----------|--------|
| HTTP Method | GET |
| Path | `grist` |
| Response Mode | Using Respond to Webhook Node |

### Nœud 2 — HTTP Request (vers Grist)
| Paramètre | Valeur |
|-----------|--------|
| Method | GET |
| URL *(mode expression)* | `https://grist.incubateur.dnum.din.developpement-durable.gouv.fr/api/docs/75GHATRaKvHSmx3FRqCi4f/tables/{{ $json.query.table }}/records` |
| Authentication | Generic Credential Type → Bearer Auth → **Bearer Auth Grist** |
| Query param `filter` *(mode expression)* | `{{ $json.query.filter \|\| undefined }}` |

> ⚠️ Les champs URL et valeur du param filter doivent être en **mode Expression** (icône `fx`).

### Nœud 3 — Respond to Webhook
| Paramètre | Valeur |
|-----------|--------|
| Respond With | JSON |
| Response Code | 200 |
| Response Body | `={{ $json }}` |
| Response Header | `Access-Control-Allow-Origin: *` |

---

## Variables d'environnement

| Variable | Où | Valeur |
|----------|----|--------|
| `NEXT_PUBLIC_GRIST_PROXY_URL` | GitHub Secret | `https://n8n.incubateur.dnum.din.developpement-durable.gouv.fr/webhook/grist` |

Définie dans `.github/workflows/deploy.yml` :
```yaml
env:
  NEXT_PUBLIC_GRIST_PROXY_URL: ${{ secrets.NEXT_PUBLIC_GRIST_PROXY_URL }}
```

La clé API Grist **n'est pas** dans les secrets GitHub — elle est stockée uniquement dans la credential n8n **"Bearer Auth Grist"**.

---

## Mettre à jour la clé API Grist

Quand la clé expire ou change (notamment lors du passage à une clé de service) :

1. Aller sur `https://grist.incubateur.dnum.din.developpement-durable.gouv.fr` → Profile Settings → API Key
2. Copier la clé
3. Dans n8n : **Credentials → Bearer Auth Grist** → mettre à jour la valeur
4. Aucun redéploiement nécessaire

---

## Générer un magic link

```
https://stiiig.github.io/grist-widgets/widgets/emile/fiche-candidat?rowId=<ID_GRIST>
```

L'`ID_GRIST` correspond au `rowId` de l'enregistrement dans la table `CANDIDATS` (colonne `id` dans Grist).

---

## Limitations actuelles

- **Lecture seule fonctionnelle** — la sauvegarde (PATCH) via le proxy n8n nécessite la gestion du preflight CORS `OPTIONS` + `PATCH` (non encore configuré dans n8n)
- **Seul l'onglet "Administratif"** est mappé sur des colonnes Grist (`src/lib/emile/fieldmap.ts`) — les autres onglets affichent un message "non mappé"
- Le magic link est **public** — toute personne ayant l'URL peut voir le dossier ; à sécuriser si besoin (token signé, authentification)
