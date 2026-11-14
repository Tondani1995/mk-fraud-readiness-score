import fs from 'node:fs';
import path from 'node:path';
import { MK_LOGO_PRIMARY_SVG, MK_LOGO_REVERSED_SVG, MK_LOGO_ASPECT_RATIO } from './brand-assets';

/**
 * MK Fraud Insights publication system for paid reports.
 *
 * Taken from the approved corporate profile (MK-Fraud-Insights-Corporate-Profile, September 2026, the version used in
 * MK's tender submissions in October): Poppins throughout, MK navy as structural mass, white reading surfaces,
 * slate text, hairline rules in blue-grey, and the sage accent used sparingly for rules, markers and figures on navy.
 * The palette below is measured from that document, not chosen. The approved vector mark is reused from
 * `brand-assets.ts`.
 *
 * The fonts are embedded from `public/fonts` (Poppins, SIL Open Font Licence) as data URIs, so the rendered PDF never
 * depends on whatever fonts the rendering machine happens to have. Earlier report renders fell back to Open Sans,
 * Arial, Inter or Liberation Sans for exactly that reason.
 */
export const MK_PUBLICATION_VERSION = 'mk-publication-1.1';

export const MK_PUB = {
  navy: '#001030', navy2: '#1D3658', blue: '#324A5F', ink: '#1E293B', text: '#334155', slate: '#475569', muted: '#7C8A9B', faint: '#94A3B8',
  rule: '#E2E8F0', surface: '#F8FAFC', mist: '#EDF1F5', sage: '#A9D4CE', sageDeep: '#8FC4BC', sageInk: '#3F7A70',
  tone: '#6B85A3', absent: '#D5DCE5', white: '#FFFFFF'
} as const;

const FONT_DIR = path.resolve(process.cwd(), 'public/fonts');
let fontCss: string | null = null;
export function mkFontFaces(): string {
  if (fontCss) return fontCss;
  const face = (file: string, weight: number) => `@font-face{font-family:'MK Poppins';font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONT_DIR, file)).toString('base64')}) format('truetype');}`;
  fontCss = [face('poppins-regular.ttf', 400), face('poppins-medium.ttf', 500), face('poppins-semibold.ttf', 600)].join('\n');
  return fontCss;
}

const TIGHT = 'viewBox="221 210 595 143"';
const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg.replace(/viewBox="[^"]+"/, TIGHT)).toString('base64')}`;
export function mkLogo(variant: 'primary' | 'reversed', heightPt: number): string {
  const uri = svgUri(variant === 'primary' ? MK_LOGO_PRIMARY_SVG : MK_LOGO_REVERSED_SVG);
  return `<img class="mk-logo" src="${uri}" alt="MK Fraud Insights" style="height:${heightPt}pt;width:${(heightPt * MK_LOGO_ASPECT_RATIO).toFixed(2)}pt"/>`;
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Running heads and folios, one named page per section so the header carries the section's name. */
export function mkPageRules(input: { footerLeft: string; runningTitle: string }): string {
  const P = MK_PUB;
  const box = (content: string, color: string, extra = '') => `content:${content};font-family:'MK Poppins';font-size:6.6pt;color:${color};${extra}`;
  const base = `
@page{size:A4;margin:25mm 21mm 21mm 21mm;
  @top-left{${box("'MK FRAUD INSIGHTS'", P.navy, 'font-weight:600;letter-spacing:.2em;vertical-align:bottom;padding-bottom:3.2mm;border-bottom:.4pt solid ' + P.rule + ';')}}
  @top-right{${box(cssString(input.runningTitle.toUpperCase()), P.faint, 'font-weight:500;letter-spacing:.16em;vertical-align:bottom;padding-bottom:3.2mm;border-bottom:.4pt solid ' + P.rule + ';')}}
  @bottom-left{${box(cssString(input.footerLeft), P.faint, 'vertical-align:top;padding-top:3mm;letter-spacing:.02em;')}}
  @bottom-right{${box("counter(page)", P.navy2, 'vertical-align:top;padding-top:3mm;font-weight:500;letter-spacing:.12em;')}}}
@page cover{margin:0;@top-left{content:none;border:0}@top-right{content:none;border:0}@bottom-left{content:none}@bottom-right{content:none}}`;
  return base;
}

export function mkPublicationCss(): string {
  const P = MK_PUB;
  return `
${mkFontFaces()}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${P.white}}
body{font-family:'MK Poppins',sans-serif;font-weight:400;font-size:9.4pt;line-height:1.72;color:${P.text};-webkit-print-color-adjust:exact;print-color-adjust:exact;font-variant-numeric:lining-nums tabular-nums;hyphens:manual;orphans:3;widows:3}
p{margin:0 0 3.4mm;max-width:152mm}
strong{font-weight:500;color:${P.ink}}
.section.newpage{break-before:page}
.section.flow{margin-top:12mm}
.eyebrow{font-size:6.8pt;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${P.navy};margin:0 0 4.2mm}
h1{font-weight:500;font-size:20.5pt;line-height:1.2;letter-spacing:-.006em;color:${P.navy};margin:0 0 6.5mm;max-width:150mm}
h2{font-weight:500;font-size:12.6pt;line-height:1.32;color:${P.navy};margin:9.5mm 0 3.2mm;max-width:150mm;break-after:avoid}
h3{font-weight:500;font-size:10.2pt;color:${P.navy};margin:6mm 0 2mm;break-after:avoid}
.unit{break-inside:auto}
.unit-label{font-size:6.6pt;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${P.sageInk};margin:9.5mm 0 -6.6mm;break-after:avoid}
.lead{font-size:10.4pt;line-height:1.66;color:${P.ink}}
.keep{break-inside:avoid}
.page-start{break-before:page}
.page-start .unit-label{margin-top:0}
.tag{display:inline-block;font-size:6.5pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${P.sageInk};border:.6pt solid ${P.sageDeep};padding:.5mm 1.6mm;margin-left:1.6mm;vertical-align:middle;border-radius:1mm}
.notice{border:.7pt dashed ${P.faint};padding:4mm 4.6mm 3mm;margin:7mm 0 4mm;break-inside:avoid}
.notice-title{font-size:6.8pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${P.slate};margin-bottom:2.4mm}
.notice table{width:100%;border-collapse:collapse}
.notice th{font-size:6.4pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${P.muted};text-align:left;padding:1.2mm 2mm 1.2mm 0;border-bottom:.5pt solid ${P.rule}}
.notice td{font-size:7.9pt;line-height:1.45;color:${P.text};padding:1.6mm 2.4mm 1.6mm 0;border-bottom:.5pt solid ${P.rule};vertical-align:top}
.notice td.strong{color:${P.ink};font-weight:500;width:34mm}
.after-head{break-before:avoid}
.rule{height:0;border-top:.5pt solid ${P.rule};margin:6mm 0}
.exhibit{break-inside:avoid;margin:6.5mm 0 7mm}
.exhibit.flowing{break-inside:auto}
thead{display:table-header-group}
.exhibit-title{font-size:6.8pt;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${P.navy};padding-bottom:2.4mm;border-bottom:.9pt solid ${P.navy};margin-bottom:0}
.caption{font-size:7pt;line-height:1.55;color:${P.muted};margin-top:2.4mm;max-width:166mm}
table{border-collapse:collapse;width:100%}
th{font-size:6.4pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${P.navy};text-align:left;padding:2.6mm 2.6mm 2.2mm 0;border-bottom:.6pt solid ${P.navy};vertical-align:bottom}
td{font-size:8.1pt;line-height:1.5;color:${P.text};padding:2.6mm 2.6mm 2.6mm 0;border-bottom:.5pt solid ${P.rule};vertical-align:top}
td.strong{color:${P.ink};font-weight:500}
td.num,th.num{text-align:right;padding-right:0}
tr{break-inside:avoid}
ul.plain{margin:0;padding:0;list-style:none}
ul.plain li{position:relative;padding-left:3.6mm;margin:0 0 1.4mm;font-size:8.1pt;line-height:1.5}
ul.plain li:before{content:'';position:absolute;left:0;top:2.1mm;width:1.5mm;height:1.5mm;border-radius:50%;background:${P.sageDeep}}
.label{font-size:6.6pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${P.slate};margin:0 0 1.2mm}
.muted{color:${P.muted}}
/* Cover */
.cover{page:cover;position:relative;width:210mm;height:296.6mm;background:${P.navy};color:${P.white};overflow:hidden;break-after:page}
.cover .inner{position:absolute;left:22mm;right:22mm;top:24mm;bottom:20mm}
.cover .brand{position:absolute;top:0;left:0}
.cover .kicker{position:absolute;top:96mm;left:0;font-size:7.2pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${P.sage}}
.cover .kicker:before{content:'';display:block;width:16mm;height:0;border-top:1pt solid ${P.sage};margin-bottom:6mm}
.cover h1.title{position:absolute;top:110mm;left:0;font-size:31pt;line-height:1.12;font-weight:500;color:${P.white};max-width:150mm;margin:0;letter-spacing:-.01em}
.cover .org{position:absolute;top:160mm;left:0;font-size:13.5pt;font-weight:500;color:${P.white};max-width:150mm;line-height:1.35}
.cover .meta{position:absolute;top:176mm;left:0;font-size:8pt;line-height:1.75;color:#B9C6D6}
.cover .proto{position:absolute;bottom:22mm;left:0;width:118mm;border:.6pt solid ${P.sage};padding:3.2mm 4mm;font-size:7.2pt;line-height:1.55;color:${P.sage}}
.cover .foot{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;border-top:.5pt solid rgba(169,212,206,.35);padding-top:3.2mm;font-size:6.6pt;letter-spacing:.14em;text-transform:uppercase;color:#8EA0B6}
.cover.back{break-before:page;break-after:auto}
.cover.back .closing{position:absolute;top:118mm;left:0;font-size:19pt;line-height:1.25;font-weight:500;color:${P.white};max-width:130mm}
.cover.back .contact{position:absolute;top:150mm;left:0;font-size:9pt;line-height:1.8;color:${P.sage}}
.cover.back .legal{position:absolute;bottom:22mm;left:0;width:128mm;font-size:6.9pt;line-height:1.6;color:#8EA0B6}
/* Contents */
.contents{margin-top:4mm}
.contents .row{display:flex;align-items:baseline;border-bottom:.5pt solid ${P.rule};padding:2.2mm 0}
.contents .row .t{flex:1;font-size:9pt;line-height:1.45;color:${P.navy};font-weight:500}
.contents .row .m{width:46mm;font-size:6.4pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${P.slate}}
.contents .row .n{width:12mm;text-align:right;font-size:8.6pt;color:${P.navy2};font-weight:500}
.contents .sub{display:flex;padding:.9mm 0 .9mm 46mm}
.contents .sub .t{flex:1;font-size:7.6pt;line-height:1.45;color:${P.text}}
.contents.compact .row{padding:1.1mm 0}.contents.compact .sub{padding:.3mm 0 .3mm 46mm}.contents.compact .row .t,.contents.compact .sub .t{line-height:1.3}
.contents .sub .n{width:12mm;text-align:right;font-size:7.6pt;color:${P.muted}}
/* Position panel */
.position{display:grid;grid-template-columns:1fr 1fr;border-top:.9pt solid ${P.navy}}
.position .cell{padding:4mm 5mm 4.2mm 0;border-bottom:.5pt solid ${P.rule}}
.position .cell:nth-child(odd){border-right:.5pt solid ${P.rule}}
.position .cell:nth-child(even){padding-left:5mm}
.position .v{font-size:12.2pt;font-weight:500;color:${P.navy};line-height:1.25;margin:0 0 1.6mm}
.position .x{font-size:8pt;line-height:1.55;color:${P.text}}
.position .cell.pending .v{color:${P.navy2}}
/* Profile */
.profile td{padding:1.55mm 2.4mm 1.55mm 0;font-size:7.9pt}
.profile .bar{display:flex;height:3.6mm;background:transparent}
.profile .bar span{display:block;height:100%}
.seg-held{background:${P.navy}}.seg-qual{background:${P.tone}}.seg-open{background:${P.sageDeep}}.seg-gap{background:${P.absent}}.seg-out{background:${P.white};border:.5pt dashed ${P.slate}}.seg-pend{background:${P.white};border:.5pt dotted ${P.slate}}
.legend{display:flex;flex-wrap:wrap;gap:2mm 6mm;margin-top:3mm;font-size:7pt;color:${P.slate}}
.legend i{display:inline-block;width:3mm;height:3mm;margin-right:1.6mm;vertical-align:-.4mm}
/* Fact strip */
.strip{display:grid;grid-template-columns:1.2fr 1.5fr 1fr 1fr;border-top:.6pt solid ${P.sageDeep};background:${P.surface};margin:4.5mm 0 2mm;break-inside:avoid}
.strip div{padding:2.6mm 3mm 2.8mm 3.2mm}
.strip .v{font-size:7.9pt;line-height:1.45;color:${P.ink}}
/* Pathway panel */
.panel{display:grid;grid-template-columns:1fr 1fr;gap:0 7mm;border-top:.6pt solid ${P.sageDeep};background:${P.surface};padding:4mm 4.5mm 3.4mm;margin:4mm 0 3mm;break-inside:avoid}
.panel p{font-size:8.1pt;line-height:1.5;margin:0 0 2.6mm;max-width:none}
/* Stages */
.stages{display:grid;gap:0;border-top:.9pt solid ${P.navy}}
.stages.n3{grid-template-columns:repeat(3,1fr)}.stages.n4{grid-template-columns:repeat(4,1fr)}
.stage{padding:4.2mm 4mm 3mm 0;border-right:.5pt solid ${P.rule}}
.stage + .stage{padding-left:4mm}
.stage:last-child{border-right:0}
.stage .k{font-size:15pt;font-weight:500;color:${P.navy};line-height:1.1;margin-bottom:.6mm}
.stage .w{font-size:6.6pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:${P.sageInk};margin-bottom:2.6mm}
.stage .p{font-size:8pt;line-height:1.5;color:${P.ink};margin-bottom:2.6mm}
.stage .o{font-size:8pt;color:${P.slate};margin-top:2mm;padding-top:2mm;border-top:.5pt solid ${P.rule}}
/* Blueprint specification */
.spec{display:grid;grid-template-columns:repeat(3,1fr);border-top:.6pt solid ${P.sageDeep};background:${P.surface};margin:4mm 0 3mm;break-inside:avoid;padding:1mm 0}
.spec > div{padding:1.7mm 3.4mm 1.7mm 3.4mm}
.spec .label{margin-bottom:.6mm}
.spec .v{font-size:8pt;line-height:1.42;color:${P.ink}}
.spec .wide{grid-column:1 / span 3}
/* Theme map */
.tmap td.dot{text-align:center;padding-right:0}
.tmap td.dot span{display:inline-block;width:2.6mm;height:2.6mm;border-radius:50%;background:${P.navy}}
.tmap th.rot{font-size:5.9pt;letter-spacing:.06em;text-align:center;padding:2mm 1.6mm 2mm 1.6mm;line-height:1.35;text-transform:none;font-weight:600}
.tmap td{padding-top:1.5mm;padding-bottom:1.5mm}
/* Operating model */
.om{display:grid;grid-template-columns:1fr;gap:1.6mm;margin-top:2.4mm}
.om .tier{display:grid;grid-template-columns:56mm 1fr;border-top:.6pt solid ${P.rule};padding-top:1.8mm}
.om .tier.top{border-top:.9pt solid ${P.navy}}
.om .who{font-size:8.2pt;line-height:1.4;font-weight:500;color:${P.navy};padding-right:5mm}
.om .what{font-size:7.9pt;line-height:1.45;color:${P.text}}
.om .basis{font-size:7.2pt;color:${P.muted};margin-top:1mm}
.om .flow{font-size:6.4pt;letter-spacing:.12em;text-transform:uppercase;color:${P.sageInk};padding-left:56mm}
/* Decision options */
.options td.rec{box-shadow:inset .9mm 0 0 ${P.navy}}
.options td:first-child{padding-left:2.6mm}
.route{border-top:.6pt solid ${P.sageDeep};background:${P.surface};padding:3.2mm 4mm;margin-top:3mm;font-size:8.1pt;line-height:1.5;color:${P.ink};break-inside:avoid}
`;
}
