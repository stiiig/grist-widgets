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

/* Icône FontAwesome selon le type MIME */
function fileIcon(mime: string): string {
  if (mime.startsWith("image/"))                            return "fa-solid fa-file-image";
  if (mime === "application/pdf")                           return "fa-solid fa-file-pdf";
  if (mime.includes("word") || mime.includes("document"))  return "fa-solid fa-file-word";
  if (mime.includes("sheet") || mime.includes("excel"))    return "fa-solid fa-file-excel";
  if (mime.startsWith("video/"))                           return "fa-solid fa-file-video";
  if (mime.startsWith("audio/"))                           return "fa-solid fa-file-audio";
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
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="att-item__link" title={name}>
        <i className={`${fileIcon(mime)} att-item__icon`} aria-hidden="true" />
        <span className="att-item__name">{name}</span>
      </a>
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
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Token + métadonnées au montage
  useEffect(() => {
    if (!docApi) return;
    Promise.all([
      docApi.getAccessToken({ readOnly: false }),
      fetchAttachmentsMeta(docApi),
    ]).then(([t, map]) => {
      setTokenInfo({ baseUrl: t.baseUrl, token: t.token });
      setMetaMap(map);
    }).catch(() => setError("Token indisponible."));
  }, [docApi]);

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
