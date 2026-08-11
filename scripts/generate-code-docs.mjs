import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsPath = path.join(root, 'docs', 'code-documentation.html');
const manifestPath = path.join(root, 'docs', '.code-documentation-manifest.json');
const reportPath = path.join(root, 'docs', '.code-documentation-changes.json');

const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const anchor = value => `id-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;

const purposeFor = entry => {
    if (entry.file.startsWith('controllers/')) return '處理 HTTP request，呼叫 service，並輸出一致的 HTTP response。';
    if (entry.file.startsWith('middleware/')) return '在 route handler 前驗證、保護或轉換 request。';
    if (entry.file.startsWith('repositories/')) return '封裝資料庫存取，並將查詢結果提供予 service layer。';
    if (entry.file.startsWith('services/')) return '實作業務規則並協調 repository 或外部服務。';
    return '提供此模組所需的可重用程式行為。';
};

const mechanicsFor = entry => {
    if (entry.file.startsWith('controllers/')) return '從 request 或已驗證的 locals 讀取輸入，等待 service 操作完成，並把已知錯誤映射為 HTTP status。';
    if (entry.file.startsWith('middleware/')) return '建立 Express middleware；失敗時立即回應，成功時呼叫 next() 交由下一個 handler。';
    if (entry.file.startsWith('repositories/')) return '以參數化 SQL 與 pool 執行資料庫 I/O，並回傳已轉換的結果。';
    if (entry.file.startsWith('services/')) return '執行非同步協調工作；會把資料層結果轉換為業務層結果或錯誤。';
    return '依照該函式在模組中的實作執行同步或非同步工作。';
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const changed = [...report.added, ...report.modified, ...report.moved];
const entries = new Map(Object.entries(manifest.functions));
for (const entry of changed) entries.set(entry.function_id, { ...entry, last_modified: entry.proposed_last_modified });
for (const entry of report.removed) entries.delete(entry.function_id);
const functions = [...entries.values()].sort((a, b) => a.file.localeCompare(b.file) || a.start_line - b.start_line);

const byDirectory = Map.groupBy(functions, entry => path.posix.dirname(entry.file));
const index = [...byDirectory.entries()].map(([directory, directoryEntries]) => {
    const byFile = Map.groupBy(directoryEntries, entry => entry.file);
    const files = [...byFile.entries()].map(([file, fileEntries]) => {
        const links = fileEntries.map(entry => `<li><a href="#${anchor(entry.function_id)}"><code>${escapeHtml(entry.name)}</code></a></li>`).join('');
        return `<li><a href="#${anchor(`file:${file}`)}"><code>${escapeHtml(file)}</code></a><ul>${links}</ul></li>`;
    }).join('');
    return `<li><a href="#${anchor(`directory:${directory}`)}"><code>${escapeHtml(directory)}</code></a><ul>${files}</ul></li>`;
}).join('');

const sections = [...byDirectory.entries()].map(([directory, directoryEntries]) => {
    const byFile = Map.groupBy(directoryEntries, entry => entry.file);
    return `<section id="${anchor(`directory:${directory}`)}"><h2>Directory: <code>${escapeHtml(directory)}</code></h2>${[...byFile.entries()].map(([file, fileEntries]) => {
        const articles = fileEntries.map(entry => {
            const parameters = entry.signature.match(/\((.*)\)/s)?.[1]?.trim() || '';
            const parameterRows = parameters
                ? `<tr><td><code>${escapeHtml(parameters)}</code></td><td>See TypeScript signature</td><td>Function input.</td></tr>`
                : '<tr><td colspan="3">None</td></tr>';
            const lastModified = entry.last_modified ?? entry.proposed_last_modified;
            return `<article id="${anchor(entry.function_id)}" class="function-operation" data-function-id="${escapeHtml(entry.function_id)}" data-source-hash="${escapeHtml(entry.source_hash)}" data-last-modified="${escapeHtml(lastModified)}">
  <header><h3><code>${escapeHtml(entry.name)}</code></h3><p>${purposeFor(entry)}</p></header>
  <section><h4>Basic information</h4><dl><dt>Name</dt><dd><code>${escapeHtml(entry.name)}</code></dd><dt>Expected return</dt><dd><code>See TypeScript signature</code></dd><dt>Last modified</dt><dd><time datetime="${escapeHtml(lastModified)}">${escapeHtml(lastModified)}</time></dd><dt>Source</dt><dd><code>src/${escapeHtml(entry.file)}:${entry.start_line}-${entry.end_line}</code></dd></dl>
  <h4>Parameters</h4><table><thead><tr><th>Name / signature</th><th>Type</th><th>Description</th></tr></thead><tbody>${parameterRows}</tbody></table></section>
  <section><h4>Purpose</h4><p>${purposeFor(entry)}</p></section><section><h4>What it does</h4><p>Executes <code>${escapeHtml(entry.name)}</code> as defined in <code>src/${escapeHtml(entry.file)}</code>. It may perform asynchronous I/O when its TypeScript signature is marked <code>async</code>.</p></section><section><h4>How it works</h4><p>${mechanicsFor(entry)}</p></section><section><h4>When to use it</h4><p>Use through the module's public API or its registered route; callers should provide values matching the TypeScript signature.</p></section>
</article>`;
        }).join('\n');
        return `<section id="${anchor(`file:${file}`)}"><h3>File: <code>src/${escapeHtml(file)}</code></h3>${articles}</section>`;
    }).join('\n')}</section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>E-commerce API code documentation</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:0;background:#f6f8fa;color:#1f2328}main{max-width:1100px;margin:auto;padding:2rem}article{background:#fff;border:1px solid #d0d7de;border-radius:.5rem;padding:1rem;margin:1rem 0}code{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d7de;padding:.5rem;text-align:left;vertical-align:top}a{color:#0969da}</style></head><body><main><header><h1>E-commerce API code documentation</h1><p>Function and method reference generated from <code>src/</code>. It contains ${functions.length} discovered TypeScript functions and methods.</p></header><nav aria-label="Function and class index"><h2>Function and class index</h2><ul>${index}</ul></nav>${sections}</main></body></html>\n`;
await writeFile(docsPath, html, 'utf8');
