"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/* Icône FontAwesome selon le type MIME */
function fileIcon(mime: string): string {
  if (mime.startsWith("image/"))       return "fa-solid fa-file-image";
  if (mime === "application/pdf")      return "fa-solid fa-file-pdf";
  if (mime.includes("word") || mime.includes("document")) return "fa-solid fa-file-word";
  if (mime.includes("sheet") || mime.includes("excel"))   return "fa-solid fa-file-excel";
  if (mime.startsWith("video/"))       return "fa-solid fa-file-video";
  if (mime.startsWith("audio/"))       return "fa-solid fa-file-audio";
  return "fa-solid fa-file";
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
  const [name, setName] = useState<string>(`…`);
  const [mime, setMime] = useState<string>("");

  useEffect(() => {
    fetch(downloadUrl, { method: "HEAD" })
      .then((r) => {
        const cd = r.headers.get("content-disposition") ?? "";
        const ct = r.headers.get("content-type") ?? "";
        const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
        setName(match ? decodeURIComponent(match[1].trim()) : `fichier_${attachId}`);
        setMime(ct.split(";")[0].trim());
      })
      .catch(() => setName(`fichier_${attachId}`));
  }, [downloadUrl, attachId]);

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!docApi) return;
    docApi
      .getAccessToken({ readOnly: false })
      .then((t: any) => setTokenInfo({ baseUrl: t.baseUrl, token: t.token }))
      .catch(() => setError("Token indisponible."));
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
        const t = await docApi.getAccessToken({ readOnly: false });
        setTokenInfo({ baseUrl: t.baseUrl, token: t.token });
      } catch (e: any) {
        setError(e?.message ?? "Erreur upload.");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [tokenInfo, ids, onChange, docApi]
  );

  return (
    <div className="emile-field emile-field--wide att-field">
      <div className="emile-field__label">{label}</div>
      <div className="att-list">
        {tokenInfo && ids.map((id) => (
          <AttachmentItem
            key={id}
            attachId={id}
            baseUrl={tokenInfo.baseUrl}
            token={tokenInfo.token}
            onRemove={() => onChange(encodeAttachmentCell(ids.filter((x) => x !== id)))}
            disabled={disabled}
          />
        ))}

        {!disabled && (
          <label className={`att-add${uploading ? " att-add--loading" : ""}`}>
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
        )}
      </div>
      {error && <div className="att-error">{error}</div>}
    </div>
  );
}
