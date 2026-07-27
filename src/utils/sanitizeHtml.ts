/**
 * 基于 DOMParser 的 HTML 白名单消毒工具（仅客户端可用）。
 * 用于第三方快讯等不可信 HTML 渲染前的 XSS 防护：
 * - 仅保留白名单标签，其余标签拆分为其子节点；
 * - script/style/iframe/object/embed 等危险标签整体移除；
 * - 剥离所有 on* 事件属性及其他非白名单属性；
 * - a 仅保留 http/https 的 href，并强制 target=_blank rel=noopener；
 * - img 仅保留 http/https 的 src 与 alt。
 */

// 允许保留的标签
const ALLOWED_TAGS = new Set([
    'p', 'span', 'div', 'br', 'hr',
    'b', 'strong', 'em', 'i', 'u', 's',
    'a', 'img',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

// 整体移除（含内容）的危险标签
const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form']);

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url.trim());

const sanitizeElement = (el: Element) => {
    // 先递归处理子节点
    Array.from(el.childNodes).forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) sanitizeElement(child as Element);
    });

    const tag = el.tagName.toLowerCase();

    // 危险标签整体移除
    if (BLOCKED_TAGS.has(tag)) {
        el.remove();
        return;
    }

    // 非白名单标签：拆分保留其（已消毒的）子节点
    if (!ALLOWED_TAGS.has(tag)) {
        el.replaceWith(...Array.from(el.childNodes));
        return;
    }

    // 白名单标签：清理属性
    Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        // 剥离所有 on* 事件属性
        if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            return;
        }
        if (tag === 'a') {
            if (name !== 'href' || !isSafeUrl(attr.value)) el.removeAttribute(attr.name);
        } else if (tag === 'img') {
            if (!['src', 'alt'].includes(name)) el.removeAttribute(attr.name);
            else if (name === 'src' && !isSafeUrl(attr.value)) el.removeAttribute(attr.name);
        } else {
            el.removeAttribute(attr.name);
        }
    });

    // 链接强制新窗口并防 reverse tabnabbing
    if (tag === 'a') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
    }
};

export const sanitizeHtml = (html: string): string => {
    if (!html) return '';
    // DOMParser 仅在客户端可用；服务端兜底剔除危险标签（快讯数据均在客户端拉取，一般不会走到）
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return html.replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '');
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    Array.from(doc.body.children).forEach(el => sanitizeElement(el));
    return doc.body.innerHTML;
};

export default sanitizeHtml;
