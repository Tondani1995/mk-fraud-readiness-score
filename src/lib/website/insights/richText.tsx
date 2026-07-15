import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

function normalizeText(text: string) {
    return (text || "").replace(/\r\n/g, "\n").trim();
}

function isSafeHref(href: string) {
    const value = href.trim();
    if (!value) return false;

    return (
        /^https?:\/\//i.test(value) ||
        /^mailto:/i.test(value) ||
        /^tel:/i.test(value) ||
        value.startsWith("/") ||
        value.startsWith("#")
    );
}

function renderInline(text: string, keyPrefix: string) {
    const nodes: ReactNode[] = [];
    const tokenRegex =
        /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|==([^=]+)==|\*([^*\n]+)\*|<u>(.*?)<\/u>/gi;
    let lastIndex = 0;
    let matchIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }

        const [
            fullMatch,
            linkLabel,
            linkHref,
            boldText,
            highlightText,
            italicText,
            underlineText,
        ] = match;
        const key = `${keyPrefix}-${matchIndex}`;

        if (linkLabel && linkHref) {
            const href = linkHref.trim();

            if (isSafeHref(href)) {
                const external = /^https?:\/\//i.test(href);
                nodes.push(
                    <a
                        key={key}
                        href={href}
                        className="font-semibold text-[#1d3658] underline decoration-[#1d3658]/35 underline-offset-4 transition-colors hover:text-[#001030]"
                        target={external ? "_blank" : undefined}
                        rel={external ? "noreferrer noopener" : undefined}
                    >
                        {linkLabel}
                    </a>
                );
            } else {
                nodes.push(linkLabel);
            }
        } else if (boldText) {
            nodes.push(
                <strong key={key} className="font-semibold text-[#001030]">
                    {boldText}
                </strong>
            );
        } else if (highlightText) {
            nodes.push(
                <mark
                    key={key}
                    className="rounded-md bg-[#ffe58f] px-1.5 py-0.5 text-[#001030]"
                >
                    {highlightText}
                </mark>
            );
        } else if (italicText) {
            nodes.push(
                <em key={key} className="italic text-slate-700">
                    {italicText}
                </em>
            );
        } else if (underlineText) {
            nodes.push(
                <span
                    key={key}
                    className="underline decoration-[#1d3658]/40 underline-offset-4"
                >
                    {underlineText}
                </span>
            );
        } else {
            nodes.push(fullMatch);
        }

        lastIndex = match.index + fullMatch.length;
        matchIndex += 1;
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes.length ? nodes : [text];
}

function renderLines(lines: string[], keyPrefix: string) {
    const nodes: ReactNode[] = [];

    lines.forEach((line, index) => {
        if (index > 0) nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
        nodes.push(...renderInline(line, `${keyPrefix}-line-${index}`));
    });

    return nodes;
}

function renderHeading(level: number, text: string, key: string) {
    if (level === 1) {
        return (
            <h2 key={key} className="mt-10 text-3xl font-semibold tracking-tight text-[#001030]">
                {renderInline(text, `${key}-h1`)}
            </h2>
        );
    }

    if (level === 2) {
        return (
            <h3 key={key} className="mt-10 text-2xl font-semibold tracking-tight text-[#001030]">
                {renderInline(text, `${key}-h2`)}
            </h3>
        );
    }

    return (
        <h4 key={key} className="mt-8 text-xl font-semibold tracking-tight text-[#001030]">
            {renderInline(text, `${key}-h3`)}
        </h4>
    );
}

function getHeadingMatch(line: string) {
    return line.match(/^(#{1,3})\s+(.+)$/);
}

function isBulletLine(line: string) {
    return /^(-|\*|\u2022)\s+/.test(line);
}

function isOrderedListLine(line: string) {
    return /^\d+\.\s+/.test(line);
}

function isQuoteLine(line: string) {
    return /^>\s+/.test(line);
}

function isStructuredLine(line: string) {
    return Boolean(
        getHeadingMatch(line) ||
        isBulletLine(line) ||
        isOrderedListLine(line) ||
        isQuoteLine(line)
    );
}

export function stripInsightFormatting(text: string) {
    return normalizeText(text)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/<u>(.*?)<\/u>/gi, "$1")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/==(.*?)==/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/^#{1,3}\s+/gm, "")
        .replace(/^(-|\*|\u2022)\s+/gm, "")
        .replace(/^\d+\.\s+/gm, "")
        .replace(/^>\s+/gm, "");
}

export function renderInsightRichText(text: string) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    const lines = normalized.split("\n");
    const nodes: ReactNode[] = [];
    let index = 0;
    let blockIndex = 0;

    while (index < lines.length) {
        const currentLine = lines[index]?.trim() || "";

        if (!currentLine) {
            index += 1;
            continue;
        }

        const key = `block-${blockIndex}`;
        const headingMatch = getHeadingMatch(currentLine);

        if (headingMatch) {
            nodes.push(renderHeading(headingMatch[1].length, headingMatch[2].trim(), key));
            index += 1;
            blockIndex += 1;
            continue;
        }

        if (isBulletLine(currentLine)) {
            const bulletLines: string[] = [];

            while (index < lines.length && isBulletLine(lines[index].trim())) {
                bulletLines.push(lines[index].trim());
                index += 1;
            }

            nodes.push(
                <ul key={key} className="mt-5 space-y-3">
                    {bulletLines.map((line, lineIndex) => {
                        const item = line.replace(/^(-|\*|\u2022)\s+/, "");
                        return (
                            <li key={`${key}-li-${lineIndex}`} className="flex items-start gap-3">
                                <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1d3658]/10">
                                    <CheckCircle2 className="h-4 w-4 text-[#1d3658]" strokeWidth={3} />
                                </span>
                                <span className="text-slate-700">
                                    {renderInline(item, `${key}-item-${lineIndex}`)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            );
            blockIndex += 1;
            continue;
        }

        if (isOrderedListLine(currentLine)) {
            const orderedLines: string[] = [];

            while (index < lines.length && isOrderedListLine(lines[index].trim())) {
                orderedLines.push(lines[index].trim());
                index += 1;
            }

            nodes.push(
                <ol
                    key={key}
                    className="mt-5 list-decimal space-y-3 pl-6 marker:font-semibold marker:text-[#1d3658]"
                >
                    {orderedLines.map((line, lineIndex) => {
                        const item = line.replace(/^\d+\.\s+/, "");
                        return (
                            <li key={`${key}-ol-${lineIndex}`} className="pl-1 text-slate-700">
                                {renderInline(item, `${key}-ordered-${lineIndex}`)}
                            </li>
                        );
                    })}
                </ol>
            );
            blockIndex += 1;
            continue;
        }

        if (isQuoteLine(currentLine)) {
            const quoteLines: string[] = [];

            while (index < lines.length && isQuoteLine(lines[index].trim())) {
                quoteLines.push(lines[index].trim().replace(/^>\s+/, ""));
                index += 1;
            }

            nodes.push(
                <blockquote
                    key={key}
                    className="mt-6 rounded-2xl border-l-4 border-[#1d3658] bg-[#1d3658]/6 px-5 py-4 text-slate-700 shadow-sm"
                >
                    <div className="leading-relaxed text-slate-700">
                        {renderLines(quoteLines, `${key}-quote`)}
                    </div>
                </blockquote>
            );
            blockIndex += 1;
            continue;
        }

        const paragraphLines: string[] = [];

        while (index < lines.length) {
            const line = lines[index]?.trim() || "";

            if (!line) {
                index += 1;
                break;
            }

            if (paragraphLines.length > 0 && isStructuredLine(line)) {
                break;
            }

            paragraphLines.push(line);
            index += 1;
        }

        const block = paragraphLines.join("\n");
        const maybeLegacyHeading =
            paragraphLines.length === 1 &&
            block.length <= 70 &&
            block.split(" ").length <= 8;

        if (maybeLegacyHeading) {
            nodes.push(
                <h3 key={key} className="mt-10 text-2xl font-semibold tracking-tight text-[#001030]">
                    {renderInline(block, `${key}-legacy-heading`)}
                </h3>
            );
            blockIndex += 1;
            continue;
        }

        nodes.push(
            <p key={key} className="mt-5 leading-relaxed text-slate-700">
                {renderLines(paragraphLines, key)}
            </p>
        );
        blockIndex += 1;
    }

    return nodes;
}
