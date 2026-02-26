"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Helpers ─────────────────────────────────────────────── */

function decodeAttachmentCell(value: any): number[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    const arr = value[0] === "L" ? value.slice(1) : value;
    return arr.filter((v: any) => typeof v === "number");
  }
  return [];
}

function encodeAttachmentCell(ids: number[]): any {
  return ["L", ...ids];
}

type AttachMeta = { fileName: string; fileType: string };

/** Charge toute la table _grist_Attachments et retourne un Map id → meta */
async function fetchAttachmentsMeta(docApi: any): Promise<Map<number, AttachMeta>> {
  try {
    const t = await docApi.fetchTable("_grist_Attachments");
    const map = new Map<number, AttachMeta>();
    for (let i = 0; i < t.id.length; i++) {
      map.set(t.id[i], {
        fileName: t.fileName?.[i] ?? "",
        fileType: t.fileType?.[i] ?? "",
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

/* Icône FontAwesome selon le type MIME + extension du nom */
function fileIcon(mime: string, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // Par MIME d'abord
  if (mime.startsWith("image/"))                            return "fa-solid fa-file-image";
  if (mime === "application/pdf")                           return "fa-solid fa-file-pdf";
  if (mime.includes("word") || mime.includes("document"))  return "fa-solid fa-file-word";
  if (mime.includes("sheet") || mime.includes("excel"))    return "fa-solid fa-file-excel";
  if (mime.startsWith("video/"))                           return "fa-solid fa-file-video";
  if (mime.startsWith("audio/"))                           return "fa-solid fa-file-audio";
  if (mime.includes("zip") || mime.includes("compressed")) return "fa-solid fa-file-zipper";
  if (mime.startsWith("text/"))                            return "fa-solid fa-file-lines";

  // Fallback par extension
  if (["jpg","jpeg","png","gif","webp","svg","bmp"].includes(ext)) return "fa-solid fa-file-image";
  if (ext === "pdf")                                        return "fa-solid fa-file-pdf";
  if (["doc","docx","odt"].includes(ext))                  return "fa-solid fa-file-word";
  if (["xls","xlsx","ods","csv"].includes(ext))            return "fa-solid fa-file-excel";
  if (["ppt","pptx","odp"].includes(ext))                  return "fa-solid fa-file-powerpoint";
  if (["mp4","avi","mov","mkv","webm"].includes(ext))      return "fa-solid fa-file-video";
  if (["mp3","wav","ogg","flac"].includes(ext))            return "fa-solid fa-file-audio";
  if (["zip","rar","7z","tar","gz"].includes(ext))         return "fa-solid fa-file-zipper";
  if (["txt","md","log"].includes(ext))                    return "fa-solid fa-file-lines";

  return "fa-solid fa-file";
}

/* ─── AttachmentItem ──────────────────────────────────────── */

function AttachmentItem({
  attachId,
  meta,
  downloadUrl,
  onRemove,
  disabled,
}: {
  attachId: number;
  meta: AttachMeta | undefined;
  downloadUrl: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  const name = meta?.fileName || `fichier_${attachId}`;
  const mime = meta?.fileType || "";

  return (
    <div className="att-item">
      <button
        type="button"
        className="att-item__link"
        title={name}
        onClick={() => window.open(downloadUrl, "_blank", "noopener,noreferrer")}
      >
        <i className={`${fileIcon(mime, name)} att-item__icon`} aria-hidden="true" />
        <span className="att-item__name">{name}</span>
      </button>
      {!disabled && (
        <button type="button" className="att-item__rm" onClick={onRemove} title="Retirer">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ─── AttachmentField ─────────────────────────────────────── */

export function AttachmentField({
  label,
  value,
  onChange,
  docApi,
  disabled,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  docApi: any;
  disabled: boolean;
}) {
  const ids = decodeAttachmentCell(value);
  const [tokenInfo, setTokenInfo] = useState<{ baseUrl: string; token: string } | null>(null);
  const [metaMap, setMetaMap] = useState<Map<number, AttachMeta>>(new Map());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Mode REST : getAccessToken absent → champ pièces jointes non rendu
  const [restMode, setRestMode] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Token + métadonnées au montage
  useEffect(() => {
    if (!docApi) return;
    // getAccessToken n'existe qu'en mode plugin Grist (pas en mode REST standalone).
    // En REST, on charge quand même _grist_Attachments pour afficher les noms de fichiers.
    if (typeof docApi.getAccessToken !== "function") {
      fetchAttachmentsMeta(docApi).then(setMetaMap).catch(() => {});
      setRestMode(true);
      return;
    }
    Promise.all([
      docApi.getAccessToken({ readOnly: false }),
      fetchAttachmentsMeta(docApi),
    ]).then(([t, map]) => {
      setTokenInfo({ baseUrl: t.baseUrl, token: t.token });
      setMetaMap(map);
    }).catch(() => setError("Token indisponible."));
  }, [docApi]);

  // ⚠️ useCallback doit être appelé AVANT tout return conditionnel (Rules of Hooks)
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !tokenInfo) return;
      setUploading(true);
      setError("");
      try {
        const newIds: number[] = [];
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.append("upload", file, file.name);
          const res = await fetch(`${tokenInfo.baseUrl}/attachments?auth=${tokenInfo.token}`, {
            method: "POST",
            body: fd,
            headers: { "X-Requested-With": "XMLHttpRequest" },
          });
          if (!res.ok) throw new Error(`Erreur ${res.status}`);
          const uploaded: number[] = await res.json();
          newIds.push(...uploaded);
        }
        onChange(encodeAttachmentCell([...ids, ...newIds]));

        // Rafraîchit token + metaMap pour afficher les nouveaux noms
        const [t, map] = await Promise.all([
          docApi.getAccessToken({ readOnly: false }),
          fetchAttachmentsMeta(docApi),
        ]);
        setTokenInfo({ baseUrl: t.baseUrl, token: t.token });
        setMetaMap(map);
      } catch (e: any) {
        setError(e?.message ?? "Erreur upload.");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [tokenInfo, ids, onChange, docApi]
  );

  // En mode REST : affichage lecture seule (pas d'upload ni de téléchargement).
  // Ce return doit être APRÈS tous les hooks (Rules of Hooks).
  if (restMode) {
    if (ids.length === 0) return null;
    return (
      <div className="emile-field emile-field--wide att-field">
        <div className="emile-field__label">{label}</div>
        <div className="att-list">
          {ids.map((id) => {
            const meta = metaMap.get(id);
            const name = meta?.fileName || `fichier_${id}`;
            const mime = meta?.fileType || "";
            return (
              <div key={id} className="att-item att-item--readonly"
                   title="Téléchargement disponible uniquement dans Grist">
                <i className={`${fileIcon(mime, name)} att-item__icon`} aria-hidden="true" />
                <span className="att-item__name">{name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Le bouton + est toujours visible (même si tokenInfo pas encore chargé),
  // mais l'input reste disabled jusqu'au token
  const uploadBtn = !disabled && (
    <label className={`att-add${uploading ? " att-add--loading" : ""}`} title="Ajouter une pièce jointe">
      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading || !tokenInfo}
      />
      {uploading
        ? <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
        : <i className="fa-solid fa-plus" aria-hidden="true" />
      }
    </label>
  );

  return (
    <div className="emile-field emile-field--wide att-field">
      <div className="emile-field__label">{label}</div>
      <div className="att-list">
        {tokenInfo && ids.map((id) => (
          <AttachmentItem
            key={id}
            attachId={id}
            meta={metaMap.get(id)}
            downloadUrl={`${tokenInfo.baseUrl}/attachments/${id}/download?auth=${tokenInfo.token}`}
            onRemove={() => onChange(encodeAttachmentCell(ids.filter((x) => x !== id)))}
            disabled={disabled}
          />
        ))}
        {uploadBtn}
      </div>
      {error && <div className="att-error">{error}</div>}
    </div>
  );
}
