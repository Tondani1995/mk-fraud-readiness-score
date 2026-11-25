import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const roots=['src/components','src/app/(website)'];
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory()){if(file==='src/components/review')continue;walk(file);}else if(/\.(tsx?|css)$/.test(file))files.push(file);}}
roots.forEach(walk);files.push('src/app/clarity.css');
// Sage #A9D4CE was reinstated as a graphical accent by the owner's 20 Nov 2026 brand directive and the 25 Nov 2026
// Management View brief; it is referenced through the --mk-sage token. The other sage and teal values stay retired.
const retired=/#(?:c8d9bf|a9bf9c|6f5537|80613b|64491f|8a6d4b|dfd8cb|f4efe7|cbbd9f|d8cbbb|12333c|0b2631|31565e)/i;
const banned=/Support ladder|One result\. Three ways to use it\.|Deeper analysis|THE MK LENS|MANAGEMENT INTELLIGENCE|AREA INTELLIGENCE|THE CONNECTED VIEW|scoring-base coverage|Tell me what is wrong|Your first clear view\.|Exposure \+ Control reality|EXPOSURE\. READINESS\. DECISIONS\./i;
const issues=[];for(const file of files){const src=fs.readFileSync(file,'utf8');if(/shadow-\[[^\]]+\]/.test(src))issues.push(`${file}: use the single named shadow level`);if(retired.test(src))issues.push(`${file}: retired colour`);if(banned.test(src))issues.push(`${file}: retired presentation phrase`);if(src.includes('—')||src.includes('&mdash;'))issues.push(`${file}: em dash`);}
assert.deepEqual(issues,[],'Customer-source brand guardrails');
const layout=fs.readFileSync('src/app/layout.tsx','utf8');assert.match(layout,/font-poppins/);assert.doesNotMatch(layout,/font-inter|manrope/i);
assert.ok(!fs.readdirSync('public/fonts').some(f=>/inter|manrope/i.test(f)));
assert.ok(fs.readFileSync('src/app/clarity.css','utf8').split('\n').length<=5538,'Do not grow clarity.css');
// The spatial narrative now owns the actual homepage opening; guard the live composition too.
assert.match(fs.readFileSync('src/app/(website)/home/page.tsx','utf8'), /<HomeStory/);
const story=fs.readFileSync('src/components/website/Home/HomeStory.tsx','utf8');
assert.match(story,/Turn fraud readiness into a management decision/);
// The method disclaimer lives in the management view, which the homepage story always renders.
assert.match(story,/<ManagementView/);
assert.match(fs.readFileSync('src/components/website/Home/ManagementView.tsx','utf8'),/Method illustration using example processes and controls\. This is not an assessment result\./);
// Retained component remains available for historical visual review.
assert.match(fs.readFileSync('src/components/website/Home/HeroSection.tsx','utf8'),/<ExposureSystem/);
assert.doesNotMatch(fs.readFileSync('src/components/website/Home/HeroSection.tsx','utf8'),/hero-index|hero-bottom/);
const baseline='1184d955';for(const file of ['src/lib/scoring/adaptive-scoring.ts','src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json','src/lib/commercial/product-catalogue.ts','src/lib/legal/fraud-readiness-terms.ts'])assert.equal(fs.readFileSync(file,'utf8'),execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}),`${file} must retain its protected logic/content`);
// Legal copy remains identical; only class attributes, decorative icon elements and import paths may change for the brand treatment.
function legalCopy(text){const source=ts.createSourceFile('legal.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values=[];function visit(node){let attr=false;for(let p=node.parent;p;p=p.parent)if(ts.isJsxAttribute(p)&&(p.name.getText(source)==='className'||p.name.getText(source)==='style')){attr=true;break;}if(!attr&&!(node.parent&&ts.isImportDeclaration(node.parent))&&(ts.isJsxText(node)||ts.isStringLiteral(node)))values.push(node.text.replace(/\s+/g,' ').trim());ts.forEachChild(node,visit);}visit(source);return values.filter(Boolean);}
for(const file of ['src/app/(website)/privacy-policy/page.tsx','src/app/(website)/terms-of-use/page.tsx'])assert.deepEqual(legalCopy(fs.readFileSync(file,'utf8')),legalCopy(execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'})),`${file}: legal wording preserved`);
console.log(JSON.stringify({ok:true,customerFilesChecked:files.length,reviewOnlyExclusion:'Frozen/non-production src/components/review fixtures; all production components are checked.',protectedFilesUnchanged:4,legalCopyUnchanged:2}));
