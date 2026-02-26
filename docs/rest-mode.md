# Mode REST standalone — Architecture et configuration

Les widgets EMILE fonctionnent normalement dans un **iframe Grist** (mode plugin). Le mode REST permet d'y accéder depuis une **URL publique**, sans iframe — pour partage externe (email, SMS) ou formulaires autonomes.

---

## Widgets accessibles en mode REST

| Widget | URL directe | Usage |
|--------|-------------|-------|
| `fiche-candidat` | `/widgets/emile/fiche-candidat?rowId=42` | Consultation/édition d'un dossier candidat via magic link |
| `ajout-etablissement` | `/widgets/emile/ajout-etablissement` | Formulaire d'ajout d'un établissement |
| `creation-compte-orienteur` | `/widgets/emile/creation-compte-orienteur` | Formulaire de création d'un compte orienteur |

---

## Architecture

```
Navigateur (GitHub Pages, CORS bloqué vers Grist)
    │
    │  GET ?table=CANDIDATS&filter={"id":[42]}
    ▼
https://n8n.incubateur.../webhook/grist   ← proxy
    │
    │  Bearer <clé API>  (jamais exposée au navigateur)
    │  GET https://grist.incubateur.dnum.din.developpement-durable.gouv.fr
    │       /api/docs/75GHATRaKvHSmx3FRqCi4f/tables/CANDIDATS/records?filter=...
    ▼
Grist (instance interne)
    │  {"records": [{id: 42, fields: {...}}]}
    ▼
n8n → réponse avec Access-Control-Allow-Origin: *
    ▼
Widget → affiche / enregistre les données
```

### Pourquoi un proxy ?

L'instance Grist ne renvoie pas les headers CORS nécessaires aux appels JS cross-origin. n8n appelle Grist côté serveur (pas de CORS), et renvoie la réponse avec `Access-Control-Allow-Origin: *`.

Avantage : la **clé API Grist ne transite jamais dans le bundle JS** — elle reste dans n8n.

---

## Activation du mode REST

Contrôlé par la variable d'environnement `NEXT_PUBLIC_GRIST_PROXY_URL` (baked dans le bundle au build Next.js).

| Variable | Valeur |
|----------|--------|
| `NEXT_PUBLIC_GRIST_PROXY_URL` | `https://n8n.incubateur.dnum.din.developpement-durable.gouv.fr/webhook/grist` |

Déclarée dans `.github/workflows/deploy.yml` :
```yaml
env:
  NEXT_PUBLIC_GRIST_PROXY_URL: ${{ secrets.NEXT_PUBLIC_GRIST_PROXY_URL }}
```

Quand cette variable est définie, `src/lib/grist/init.ts` bascule automatiquement en mode `rest` et utilise `createRestDocApi()` au lieu du plugin Grist.

---

## Fichiers clés

### `src/lib/grist/rest.ts`

Implémente `GristDocAPI` via le proxy n8n :

| Méthode | Requête vers n8n | Traduite par n8n en |
|---------|-----------------|---------------------|
| `fetchTable(tableId)` | `GET ?table=TABLE` | `GET /tables/TABLE/records` |
| `fetchSingleRowRest(tableId, rowId)` | `GET ?table=TABLE&filter={"id":[rowId]}` | `GET /tables/TABLE/records?filter=...` |
| `applyUserActions([["AddRecord", ...]])` | `POST ?table=TABLE` | `POST /tables/TABLE/records` |
| `applyUserActions([["UpdateRecord", ...]])` | `PATCH ?table=TABLE` | `PATCH /tables/TABLE/records` |

### `src/lib/grist/meta.ts` — `loadColumnsMetaFor`

Charge les métadonnées des colonnes (types, options, choices) via les tables internes Grist :
1. `fetchTable("_grist_Tables")` → trouve le rowId de la table cible
2. `fetchTable("_grist_Tables_column")` → récupère les colonnes de cette table

Ces deux tables sont accessibles via le proxy n8n comme n'importe quelle table normale.

### `src/lib/grist/hooks.ts`

- `useGristInit` : charge `grist-plugin-api.js` uniquement si on est dans un iframe. En mode standalone, ce script n'est jamais chargé.
- `useDepartementOptions` : charge `DPTS_REGIONS` via `fetchTable`, retourne `{deptOptions, dptsLoading, dptsError}`.

---

## Configuration n8n

### Workflow

**Webhook URL (production) :**
```
https://n8n.incubateur.dnum.din.developpement-durable.gouv.fr/webhook/grist
```

### Nœud 1 — Webhook

| Paramètre | Valeur |
|-----------|--------|
| HTTP Method | GET |
| Path | `grist` |
| Response Mode | Using Respond to Webhook Node |

### Nœud 2 — HTTP Request (appel Grist)

| Paramètre | Valeur |
|-----------|--------|
| Method | GET |
| Authentication | Generic Credential Type → Bearer Auth → **Bearer Auth Grist** |
| Query Parameters | **Vide** — ne rien mettre dans "Using Fields Below" |

**URL** (coller dans le champ URL, **sans** activer le toggle `fx`) :
```
https://grist.incubateur.dnum.din.developpement-durable.gouv.fr/api/docs/75GHATRaKvHSmx3FRqCi4f/tables/{{ $json.query.table }}/records{{ $json.query.filter ? '?filter=' + $json.query.filter : '' }}
```

> ⚠️ **Ne jamais ajouter de param `filter` dans "Using Fields Below".**
> Le filtre est géré exclusivement par l'expression `{{ ... }}` dans l'URL.
> Si le filtre est présent aux deux endroits, n8n l'envoie en double → Grist retourne une erreur JSON parse.
>
> ℹ️ La syntaxe `{{ }}` (sans `=`) est requise ici. Le mode expression `={{ }}` ne fonctionne pas dans ce champ sur cette instance n8n.

Cas couverts par l'URL :

| Requête entrante | URL envoyée à Grist |
|-----------------|---------------------|
| `?table=ETABLISSEMENTS` | `.../tables/ETABLISSEMENTS/records` |
| `?table=CANDIDATS&filter={"id":[42]}` | `.../tables/CANDIDATS/records?filter=%7B%22id%22%3A%5B42%5D%7D` |
| `?table=_grist_Tables` | `.../tables/_grist_Tables/records` |

### Nœud 3 — Respond to Webhook

| Paramètre | Valeur |
|-----------|--------|
| Respond With | JSON |
| Response Code | 200 |
| Response Body | `={{ $json }}` |
| Response Headers | `Access-Control-Allow-Origin: *` |

---

## Table IDs Grist

> ⚠️ Le **Table ID** Grist (utilisé dans l'API et dans le code) est différent du **nom d'affichage** visible dans l'onglet. En cas de renommage d'une table, le Table ID ne change pas automatiquement.

Pour vérifier ou modifier le Table ID d'une table : clic droit sur l'onglet → **Table Settings** → champ **Table ID**.

Tables utilisées par les widgets EMILE :

| Table ID (API) | Utilisée par |
|----------------|-------------|
| `CANDIDATS` | `fiche-candidat`, `inscription-candidat` |
| `ETABLISSEMENTS` | `ajout-etablissement`, `creation-compte-orienteur` |
| `ACCOMPAGNANTS` | `creation-compte-orienteur` |
| `DPTS_REGIONS` | `ajout-etablissement` |
| `_grist_Tables` | `loadColumnsMetaFor` (méta interne) |
| `_grist_Tables_column` | `loadColumnsMetaFor` (méta interne) |

---

## Mettre à jour la clé API Grist

1. Aller sur Grist → Profile Settings → API Key → copier la clé
2. Dans n8n : **Credentials → Bearer Auth Grist** → coller la nouvelle clé
3. Aucun redéploiement nécessaire

---

## Générer un magic link (fiche candidat)

```
https://stiiig.github.io/grist-widgets/widgets/emile/fiche-candidat?rowId=<ID_GRIST>
```

`ID_GRIST` = rowId de l'enregistrement dans la table `CANDIDATS` (colonne `id` dans Grist).

---

## Limitations connues

### POST / PATCH non gérés par n8n

Le nœud n8n actuel accepte uniquement les requêtes GET. Les formulaires qui créent (`AddRecord` → POST) ou modifient (`UpdateRecord` → PATCH) des données **échoueront silencieusement** en mode REST jusqu'à ce que n8n gère aussi ces méthodes.

Pour ajouter le support POST/PATCH dans n8n :
- Passer le webhook en mode "Any Method" (ou créer un second webhook)
- Ajouter une branche conditionnelle sur `$json.method` pour router vers `/records` en POST ou PATCH selon le cas
- Configurer les headers CORS pour les preflights OPTIONS

### Pièces jointes (AttachmentField)

`AttachmentField` requiert `getAccessToken()`, une méthode disponible uniquement dans le plugin Grist. En mode REST, l'onglet contenant les pièces jointes n'est pas affiché (retourne `null` silencieusement).

### Fiche candidat — onglets non mappés

Seul l'onglet "Administratif" de `fiche-candidat` est mappé sur des colonnes Grist. Les autres onglets affichent "non mappé" hors iframe.

### Sécurité du magic link

Le magic link est **public** — toute personne ayant l'URL peut consulter le dossier. À sécuriser si nécessaire (token signé, expiration, authentification).
