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
| URL | voir ci-dessous (syntaxe `{{ }}`, **pas** de mode expression `fx`) |
| Authentication | Generic Credential Type → Bearer Auth → **Bearer Auth Grist** |
| Query Parameters | *(aucun — filtre et action intégrés dans l'URL)* |

**URL** (coller telle quelle dans le champ URL, sans activer `fx`) :
```
https://grist.incubateur.dnum.din.developpement-durable.gouv.fr/api/docs/75GHATRaKvHSmx3FRqCi4f/tables/{{ $json.query.table }}/{{ $json.query.action === 'columns' ? 'columns' : 'records' }}{{ $json.query.filter ? '?filter=' + encodeURIComponent($json.query.filter) : '' }}
```

Cette URL gère trois cas :

| Requête entrante | URL vers Grist |
|-----------------|----------------|
| `?table=ETABLISSEMENTS` | `.../tables/ETABLISSEMENTS/records` |
| `?table=CANDIDATS&filter={"id":[42]}` | `.../tables/CANDIDATS/records?filter=%7B...%7D` |
| `?table=ETABLISSEMENTS&action=columns` | `.../tables/ETABLISSEMENTS/columns` |

> ℹ️ Le param `action=columns` est envoyé par `fetchColumnsRest` dans `rest.ts` pour charger les métadonnées des colonnes (choices, types…) sans passer par les tables internes `_grist_Tables` / `_grist_Tables_column`.

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

## Widgets accessibles en mode REST (URL directe)

En plus de `fiche-candidat`, les widgets suivants fonctionnent en accès direct (hors iframe Grist) :

| Widget | URL | Dépendances Grist |
|--------|-----|-------------------|
| `ajout-etablissement` | `/widgets/emile/ajout-etablissement` | `ETABLISSEMENTS`, `DPTS_REGIONS` + `/columns` |
| `creation-compte-orienteur` | `/widgets/emile/creation-compte-orienteur` | `ETABLISSEMENTS`, `ACCOMPAGNANTS` + `/columns` |

Ces widgets chargent des **tables entières** (sans filtre) et utilisent l'endpoint `/columns` pour les métadonnées (choices des dropdowns Dispositif, Organisme gestionnaire, Fonction). Le nœud n8n route automatiquement vers `/columns` ou `/records` selon le param `action`.

---

## Limitations actuelles

- **Sauvegarde (PATCH/POST) en mode REST** — les widgets formulaire utilisent `AddRecord` (POST) qui fonctionne. La sauvegarde dans `fiche-candidat` (UpdateRecord → PATCH) nécessite la gestion du preflight CORS `OPTIONS` + `PATCH` (non encore configuré dans n8n)
- **Seul l'onglet "Administratif"** de `fiche-candidat` est mappé sur des colonnes Grist (`src/lib/emile/fieldmap.ts`) — les autres onglets affichent un message "non mappé"
- Le magic link est **public** — toute personne ayant l'URL peut voir le dossier ; à sécuriser si besoin (token signé, authentification)
