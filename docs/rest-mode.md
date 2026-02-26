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

| Méthode | Requête vers n8n | Traduite par n8n en | Workflow |
|---------|-----------------|---------------------|----------|
| `fetchTable(tableId)` | `GET ?table=TABLE` | `GET /tables/TABLE/records` | GET |
| `fetchSingleRowRest(tableId, rowId)` | `GET ?table=TABLE&filter={"id":[rowId]}` | `GET /tables/TABLE/records?filter=...` | GET |
| `getAttachmentDownloadUrl(id)` | `GET ?attachId=ID` | `GET /attachments/ID/download` | GET |
| `uploadAttachments(files)` | `POST multipart/form-data` (champ `upload`) | `POST /attachments` | POST |
| `applyUserActions([["AddRecord", ...]])` | `POST ?table=TABLE` + JSON | `POST /tables/TABLE/records` | POST* |
| `applyUserActions([["UpdateRecord", ...]])` | `PATCH ?table=TABLE` + JSON | `PATCH /tables/TABLE/records` | POST* |

> \* Les actions `AddRecord` / `UpdateRecord` envoient du `Content-Type: application/json`, ce qui déclenche un preflight OPTIONS. Le workflow POST devra gérer ce cas si ces actions sont utilisées en mode REST (voir Limitations).

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

### Deux workflows séparés

Le widget utilise **deux workflows n8n distincts** au même path `grist` :

- **Workflow GET** — gère les lectures (records, métadonnées, téléchargement de pièces jointes)
- **Workflow POST** — gère l'upload de pièces jointes

> **Pourquoi deux workflows ?** L'upload `multipart/form-data` sans header custom est une [« simple CORS request »](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#simple_requests) : le navigateur ne fait pas de preflight OPTIONS. On peut donc utiliser un webhook POST dédié sans avoir à gérer OPTIONS — et sans avoir besoin de « Any Method » sur le webhook GET.

---

## Workflow GET — records et téléchargement

**URL (production) :**
```
https://n8n.incubateur.dnum.din.developpement-durable.gouv.fr/webhook/grist
```

### Nœud 1 — Webhook (GET)

| Paramètre | Valeur |
|-----------|--------|
| HTTP Method | **GET** |
| Path | `grist` |
| Response Mode | Using Respond to Webhook Node |

### Nœud 2 — IF Attachment download

| Paramètre | Valeur |
|-----------|--------|
| Condition | `{{ $json.query.attachId }}` **is not empty** |
| True → | branche téléchargement pièce jointe |
| False → | branche records |

---

### Branche **download** (True)

#### Nœud 3a — HTTP Request (fichier binaire)

| Paramètre | Valeur |
|-----------|--------|
| Method | GET |
| URL | `https://grist.incubateur.dnum.din.developpement-durable.gouv.fr/api/docs/75GHATRaKvHSmx3FRqCi4f/attachments/{{ $json.query.attachId }}/download` |
| Authentication | Generic Credential Type → Bearer Auth → **Bearer Auth Grist** |
| Response Format | **File** |

#### Nœud 4a — Respond to Webhook (binaire)

| Paramètre | Valeur |
|-----------|--------|
| Respond With | **Binary Data** |
| Response Data Property Name | `data` |
| Response Code | 200 |
| Response Headers | `Access-Control-Allow-Origin: *` |

> ℹ️ n8n forward automatiquement les headers `Content-Type` et `Content-Disposition` de la réponse Grist, ce qui déclenche le téléchargement du fichier dans le navigateur.

---

### Branche **records** (False)

#### Nœud 3b — HTTP Request (appel Grist — records)

| Paramètre | Valeur |
|-----------|--------|
| Method | GET |
| Authentication | Generic Credential Type → Bearer Auth → **Bearer Auth Grist** |
| Query Parameters | **Vide** |

**URL** (sans activer `fx`) :
```
https://grist.incubateur.dnum.din.developpement-durable.gouv.fr/api/docs/75GHATRaKvHSmx3FRqCi4f/tables/{{ $json.query.table }}/records{{ $json.query.filter ? '?filter=' + $json.query.filter : '' }}
```

> ⚠️ Ne jamais ajouter de param `filter` dans "Using Fields Below" — utiliser uniquement l'expression dans l'URL.

Cas couverts :

| Requête entrante | URL envoyée à Grist |
|-----------------|---------------------|
| `?table=ETABLISSEMENTS` | `.../tables/ETABLISSEMENTS/records` |
| `?table=CANDIDATS&filter={"id":[42]}` | `.../tables/CANDIDATS/records?filter=...` |
| `?table=_grist_Tables` | `.../tables/_grist_Tables/records` |

#### Nœud 4b — Respond to Webhook (JSON)

| Paramètre | Valeur |
|-----------|--------|
| Respond With | JSON |
| Response Code | 200 |
| Response Body | `={{ $json }}` |
| Response Headers | `Access-Control-Allow-Origin: *` |

---

### Schéma — Workflow GET

```
Webhook GET (path: grist)
    │
    ▼
IF query.attachId is not empty
    │
    ├─ True  ──► HTTP Request GET /attachments/{id}/download ──► Respond Binary
    │
    └─ False ──► HTTP Request GET /tables/{table}/records ────► Respond JSON
```

---

## Workflow POST — upload de pièces jointes

**URL (production) :**
```
https://n8n.incubateur.dnum.din.developpement-durable.gouv.fr/webhook/grist
```
*(même path que le workflow GET — n8n route par méthode HTTP)*

> ℹ️ Le widget envoie un `POST multipart/form-data` sans header custom → pas de preflight CORS OPTIONS. Le webhook POST n'a donc pas besoin de gérer OPTIONS.

### Nœud 1 — Webhook (POST)

| Paramètre | Valeur |
|-----------|--------|
| HTTP Method | **POST** |
| Path | `grist` |
| Response Mode | Using Respond to Webhook Node |

### Nœud 2 — HTTP Request (upload vers Grist)

| Paramètre | Valeur |
|-----------|--------|
| Method | POST |
| URL | `https://grist.incubateur.dnum.din.developpement-durable.gouv.fr/api/docs/75GHATRaKvHSmx3FRqCi4f/attachments` |
| Authentication | Generic Credential Type → Bearer Auth → **Bearer Auth Grist** |
| Body Content Type | **Form-Data** |
| Body Parameters | Name: `upload` / Type: **n8n Binary File** / Value: `data` |

> ℹ️ `Value: data` fait référence au nom de la propriété binaire dans le nœud webhook. Si n8n nomme autrement la propriété binaire, vérifier l'output du Webhook et adapter.

### Nœud 3 — Respond to Webhook (IDs des pièces jointes)

| Paramètre | Valeur |
|-----------|--------|
| Respond With | JSON |
| Response Body | `={{ $json }}` |
| Response Code | 200 |
| Response Headers | `Access-Control-Allow-Origin: *` |

> La réponse Grist est un tableau d'entiers : `[42, 43]` (rowIds des nouvelles pièces jointes).

---

### Schéma — Workflow POST

```
Webhook POST (path: grist)
    │
    ▼
HTTP Request POST /attachments (Form-Data, champ: upload)
    │
    ▼
Respond JSON [id1, id2, ...] + Access-Control-Allow-Origin: *
```

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

### AddRecord / UpdateRecord — preflight CORS bloquant

Les actions `AddRecord` et `UpdateRecord` (sauvegarde de fiche, soumission de formulaire) envoient un `Content-Type: application/json`, ce qui déclenche un **preflight CORS OPTIONS**. Le workflow POST actuel ne gère que le `multipart/form-data` de l'upload.

Pour débloquer ces actions en mode REST, il faudra soit :
- Ajouter un webhook **PATCH** dédié (avec branche sur `$json.method` dans le workflow POST) et répondre aux OPTIONS avec les bons headers CORS
- Ou exposer un endpoint côté serveur (Next.js API route) qui fait le proxy sans contrainte CORS

Jusqu'à ce que ce soit configuré, les sauvegardes en mode REST échoueront.

### Pièces jointes (AttachmentField)

Support en mode REST selon configuration n8n :

| Fonctionnalité | Disponible | Condition |
|----------------|-----------|-----------|
| Affichage des noms | ✅ | Automatique (`_grist_Attachments` proxifié via workflow GET) |
| Téléchargement | ✅ | Branche `?attachId=X` dans le workflow GET configurée |
| Upload | ✅ | Workflow POST configuré |
| Suppression | ✅ | Upload opérationnel (ré-enregistre la liste sans l'ID supprimé) |

### Fiche candidat — onglets non mappés

Seul l'onglet "Administratif" de `fiche-candidat` est mappé sur des colonnes Grist. Les autres onglets affichent "non mappé" hors iframe.

### Sécurité du magic link

Le magic link est **public** — toute personne ayant l'URL peut consulter le dossier. À sécuriser si nécessaire (token signé, expiration, authentification).
