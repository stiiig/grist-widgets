"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Décode une cellule Grist Attachments : ['L', id1, id2, ...]
 * Retourne un tableau d'IDs numériques.
 */
function decodeAttachmentCell(value: any): number[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    // Format Grist : ['L', id1, id2, ...]
    const arr = value[0] === "L" ? value.slice(1) : value;
    return arr.filter((v: any) => typeof v === "number");
  }
  return [];
}

function encodeAttachmentCell(ids: number[]): any {
  return ["L", ...ids];
}

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

function guessFilename(url: string): string {
  // L'URL de download Grist ne contient pas le nom… on affiche juste l'ID
  return "";
}

/* ─── AttachmentItem ──────────────────────────────────────── */

function AttachmentItem({
  attachId,
  baseUrl,
  token,
  onRemove,
  disabled,
}: {
  attachId: number;
  baseUrl: string;
  token: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  const downloadUrl = `${baseUrl}/attachments/${attachId}/download?auth=${token}`;
  const [meta, setMeta] = useState<{ name: string; type: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    // HEAD request pour récupérer Content-Disposition et Content-Type
    fetch(downloadUrl, { method: "HEAD" })
      .then((r) => {
        const cd = r.headers.get("content-disposition") ?? "";
        const ct = r.headers.get("content-type") ?? "";
        const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
        const name = match ? decodeURIComponent(match[1].trim()) : `pièce jointe #${attachId}`;
        setMeta({ name, type: ct });
        if (ct.startsWith("image/")) setPreview(downloadUrl);
      })
      .catch(() => setMeta({ name: `pièce jointe #${attachId}`, type: "" }));
  }, [downloadUrl, attachId]);

  const ext = meta?.name.includes(".") ? meta.name.split(".").pop()?.toUpperCase() ?? "FILE" : "FILE";
  const isImg = meta?.type.startsWith("image/") || false;
  const isPdf = meta?.type === "application/pdf";

  return (
    <div className="att-item">
      {/* Miniature image */}
      {preview && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="att-item__thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={meta?.name} />
        </a>
      )}

      {/* Badge type + nom */}
      <div className="att-item__body">
        <span className="att-item__badge">{isImg ? "IMG" : isPdf ? "PDF" : ext}</span>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="att-item__name"
          title={meta?.name}
        >
          {meta ? meta.name : `#${attachId}`}
        </a>
      </div>

      {/* Actions */}
      <div className="att-item__actions">
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="att-btn att-btn--dl" title="Télécharger">
          <i className="fa-solid fa-download" />
        </a>
        {!disabled && (
          <button type="button" className="att-btn att-btn--rm" onClick={onRemove} title="Retirer">
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </div>
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Récupère un token frais à chaque render (ils expirent)
  useEffect(() => {
    if (!docApi) return;
    docApi
      .getAccessToken({ readOnly: false })
      .then((t: any) => setTokenInfo({ baseUrl: t.baseUrl, token: t.token }))
      .catch(() => setError("Impossible d'obtenir le token d'accès."));
  }, [docApi]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !tokenInfo) return;
      setUploading(true);
      setError("");
      try {
        const newIds: number[] = [];
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("upload", file, file.name);
          const res = await fetch(
            `${tokenInfo.baseUrl}/attachments?auth=${tokenInfo.token}`,
            {
              method: "POST",
              body: formData,
              headers: { "X-Requested-With": "XMLHttpRequest" },
            }
          );
          if (!res.ok) throw new Error(`Erreur upload : ${res.status}`);
          const uploaded: number[] = await res.json();
          newIds.push(...uploaded);
        }
        onChange(encodeAttachmentCell([...ids, ...newIds]));
        // Rafraîchit le token après upload
        const t = await docApi.getAccessToken({ readOnly: false });
        setTokenInfo({ baseUrl: t.baseUrl, token: t.token });
      } catch (e: any) {
        setError(e?.message ?? "Erreur lors de l'upload.");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [tokenInfo, ids, onChange, docApi]
  );

  const handleRemove = useCallback(
    (id: number) => {
      onChange(encodeAttachmentCell(ids.filter((x) => x !== id)));
    },
    [ids, onChange]
  );

  return (
    <div className="emile-field emile-field--wide att-field">
      <div className="emile-field__label">{label}</div>

      <div className="att-list">
        {ids.length === 0 && (
          <span className="att-empty">Aucune pièce jointe</span>
        )}

        {tokenInfo &&
          ids.map((id) => (
            <AttachmentItem
              key={id}
              attachId={id}
              baseUrl={tokenInfo.baseUrl}
              token={tokenInfo.token}
              onRemove={() => handleRemove(id)}
              disabled={disabled}
            />
          ))}

        {!disabled && (
          <label className={`att-add${uploading ? " att-add--loading" : ""}`} title="Ajouter une pièce jointe">
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading || !tokenInfo}
            />
            {uploading ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <>
                <i className="fa-solid fa-plus" />
                <span>Ajouter</span>
              </>
            )}
          </label>
        )}
      </div>

      {error && <div className="att-error">{error}</div>}
    </div>
  );
}
