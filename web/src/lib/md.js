// Lightweight markdown renderer — ported from the original app so output
// (and CSS hooks like .codewrap / .copy-code) stay identical.
const NUL = String.fromCharCode(0);

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function md(src) {
  const blocks = [];
  src = String(src ?? '');
  // fenced code
  src = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    const i = blocks.length;
    blocks.push(
      `<div class="codewrap"><button class="copy-code" data-code="${encodeURIComponent(
        code,
      )}">copy</button><pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`,
    );
    return NUL + 'B' + i + NUL;
  });
  src = esc(src);
  src = src.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  src = src
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  src = src
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>');
  src = src.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  src = src.replace(/(?:^[-*] .+(?:\n|$))+/gm, (m) => '<ul>' + m.trim().split('\n').map((l) => '<li>' + l.replace(/^[-*] /, '') + '</li>').join('') + '</ul>');
  src = src.replace(/(?:^\d+\. .+(?:\n|$))+/gm, (m) => '<ol>' + m.trim().split('\n').map((l) => '<li>' + l.replace(/^\d+\. /, '') + '</li>').join('') + '</ol>');
  src = src.split(/\n{2,}/).map((p) => {
    p = p.trim();
    if (!p) return '';
    if (/^<(h\d|ul|ol|blockquote|div)/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  src = src.replace(new RegExp(NUL + 'B(\\d+)' + NUL, 'g'), (m, i) => blocks[+i]);
  return src;
}
