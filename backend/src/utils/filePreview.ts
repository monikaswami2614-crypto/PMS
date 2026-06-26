import path from 'path';
import { Response } from 'express';

type PreviewMode = 'image' | 'pdf' | 'text' | 'unsupported';

type FilePreviewDetails = {
  name: string;
  extension?: string | null;
  size?: number | null;
  modifiedAt?: Date | string | null;
  relativePath?: string | null;
  path?: string | null;
};

const imageExtensions = new Set(['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const textExtensions = new Set(['.csv', '.css', '.html', '.js', '.json', '.log', '.md', '.txt', '.xml', '.yml', '.yaml']);

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const getPreviewMode = (fileName: string): PreviewMode => {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.pdf') return 'pdf';
  if (imageExtensions.has(extension)) return 'image';
  if (textExtensions.has(extension)) return 'text';
  return 'unsupported';
};

const formatBytes = (size?: number | null): string => {
  if (typeof size !== 'number' || Number.isNaN(size)) return 'Unknown';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (value?: Date | string | null): string => {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

const getDetailsRows = (details: FilePreviewDetails, extension: string): string => {
  const rows = [
    ['File name', details.name],
    ['File type', extension],
    ['File size', formatBytes(details.size)],
    ['Modified', formatDate(details.modifiedAt)],
    ['Relative path', details.relativePath || 'Not available'],
    ['Disk path', details.path || 'Not available'],
  ];

  return rows.map(([label, value]) => `
    <div class="detailRow">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join('');
};

export const setInlineFileHeaders = (res: Response, fileName: string): void => {
  const safeFileName = fileName.replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
};

export const sendInlineFile = (res: Response, filePath: string, fileName: string): void => {
  setInlineFileHeaders(res, fileName);
  res.sendFile(filePath);
};

export const sendFilePreviewPage = (res: Response, details: FilePreviewDetails, rawUrl: string): void => {
  const fileName = details.name;
  const mode = getPreviewMode(fileName);
  const safeName = escapeHtml(fileName);
  const safeRawUrl = escapeHtml(rawUrl);
  const extension = (details.extension || path.extname(fileName) || 'file').toLowerCase();
  const detailsRows = getDetailsRows(details, extension);

  const viewer = (() => {
    if (mode === 'image') {
      return `<img class="imagePreview" src="${safeRawUrl}" alt="${safeName}" />`;
    }

    if (mode === 'pdf') {
      return `<iframe class="framePreview" src="${safeRawUrl}" title="${safeName}"></iframe>`;
    }

    if (mode === 'text') {
      return `<pre id="textPreview" class="textPreview">Loading file...</pre>
        <script>
          fetch(${JSON.stringify(rawUrl)})
            .then((response) => response.ok ? response.text() : Promise.reject(new Error('Unable to load file')))
            .then((content) => { document.getElementById('textPreview').textContent = content; })
            .catch(() => { document.getElementById('textPreview').textContent = 'Preview unavailable.'; });
        </script>`;
    }

    return `<div class="previewBackdrop">
        <section class="previewModal" role="dialog" aria-modal="true" aria-labelledby="unsupportedTitle">
          <div class="modalHeader">
            <div>
              <span class="modalEyebrow">File preview</span>
              <h2 id="unsupportedTitle">Preview not supported</h2>
            </div>
            <a class="modalAction" href="${safeRawUrl}" target="_self">Open raw file</a>
          </div>
          <p class="modalText">This <strong>${escapeHtml(extension)}</strong> file cannot be displayed directly by this browser. The file details are shown below, and it will not auto-download from this preview screen.</p>
          <dl class="detailList">${detailsRows}</dl>
        </section>
      </div>`;
  })();

  res.status(200).type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeName}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0b1120;
        color: #e5e7eb;
        font-family: Arial, Helvetica, sans-serif;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 18px;
        border-bottom: 1px solid #1f2a44;
        background: #111827;
      }
      h1 {
        margin: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 700;
      }
      .openRaw {
        flex: 0 0 auto;
        color: #c4b5fd;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
      }
      main {
        height: calc(100vh - 50px);
        padding: 0;
      }
      .framePreview {
        width: 100%;
        height: 100%;
        border: 0;
        background: #0f172a;
      }
      .imagePreview {
        display: block;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 82px);
        margin: 16px auto;
        object-fit: contain;
      }
      .textPreview {
        box-sizing: border-box;
        width: 100%;
        min-height: 100%;
        margin: 0;
        padding: 18px;
        white-space: pre-wrap;
        word-break: break-word;
        color: #dbeafe;
        background: #0f172a;
        font: 13px/1.55 Consolas, Monaco, monospace;
      }
      .unsupported {
        display: none;
      }
      .previewBackdrop {
        display: grid;
        place-items: center;
        min-height: 100%;
        padding: 32px;
        background:
          radial-gradient(circle at top left, rgba(124, 58, 237, 0.16), transparent 28%),
          #0b1120;
      }
      .previewModal {
        width: min(760px, calc(100vw - 48px));
        max-height: calc(100vh - 120px);
        overflow: auto;
        box-sizing: border-box;
        padding: 22px;
        border: 1px solid #334155;
        border-radius: 8px;
        background: #111827;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
      }
      .modalHeader {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 14px;
      }
      .modalEyebrow {
        display: block;
        margin-bottom: 6px;
        color: #93c5fd;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .previewModal h2 {
        margin: 0;
        font-size: 22px;
      }
      .modalAction {
        flex: 0 0 auto;
        padding: 9px 12px;
        border: 1px solid #6d5dfc;
        border-radius: 6px;
        color: #ede9fe;
        background: #4338ca;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
      }
      .modalText {
        margin: 0 0 18px;
        color: #b6c2d1;
        line-height: 1.55;
      }
      .note {
        color: #94a3b8;
      }
      .detailList {
        display: grid;
        gap: 10px;
        margin: 0;
      }
      .detailRow {
        display: grid;
        grid-template-columns: 140px minmax(0, 1fr);
        gap: 14px;
        padding: 12px;
        border: 1px solid #26334d;
        border-radius: 6px;
        background: #0f172a;
      }
      .detailRow dt {
        color: #94a3b8;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .detailRow dd {
        min-width: 0;
        margin: 0;
        overflow-wrap: anywhere;
        color: #e5e7eb;
        font-size: 14px;
      }
      .note {
        position: fixed;
        left: 16px;
        bottom: 16px;
        right: 16px;
        margin: 0;
        padding: 10px 12px;
        border: 1px solid #334155;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.92);
        font-size: 13px;
      }
      @media (max-width: 620px) {
        .modalHeader,
        .detailRow {
          grid-template-columns: 1fr;
        }
        .modalHeader {
          display: grid;
        }
        .modalAction {
          width: fit-content;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1 title="${safeName}">${safeName}</h1>
      <a class="openRaw" href="${safeRawUrl}" target="_self">Open raw file</a>
    </header>
    <main>${viewer}</main>
  </body>
</html>`);
};
