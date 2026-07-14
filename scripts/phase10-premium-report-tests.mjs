import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const assert = (condition, label) => { if (!condition) throw new Error(label); };
const includes = (file, needle, label) => assert(read(file).includes(needle), `${label}: ${needle}`);
const excludes = (file, needle, label) => assert(!read(file).includes(needle), `${label}: ${needle}`);

for (const file of [
  'package.json',
  'next.config.mjs',
  'src/lib/reports/assemble-report-data.ts',
  'src/lib/reports/report-entitlement.ts',
  'src/lib/reports/fallback-content.ts',
  'src/lib/reports/select-content-blocks.ts',
  'src/lib/reports/roadmap.ts',
  'src/lib/reports/render-pdf.ts',
  'src/lib/reports/templates/report-template.ts',
  'src/lib/reports/premium-report-service.ts',
  'src/lib/reports/storage-publication.ts',
  'src/lib/reports/download-verification.ts',
  'src/app/api/admin/orders/[orderReference]/generate-report/route.ts',
  'src/app/api/admin/reports/[reportId]/download/route.ts',
  'supabase/migrations/0011_phase10_pdf_report_engine_additions.sql'
]) assert(exists(file), `${file} must exist`);

const pkg = JSON.parse(read('package.json'));
assert(pkg.engines?.node === '24.x', 'Node 24 must be explicit after the controlled compatibility spike');
assert(pkg.dependencies?.next?.startsWith('^14.'), 'Next must remain on 14.x');
assert(pkg.dependencies?.react?.startsWith('^18.'), 'React must remain on 18.x');
assert(pkg.dependencies?.['@sparticuz/chromium'], 'Chromium package must remain installed');
assert(pkg.dependencies?.['puppeteer-core'], 'puppeteer-core must remain installed');

includes('next.config.mjs', 'outputFileTracingIncludes', 'Chromium assets must be traced');
includes('next.config.mjs', '@sparticuz/chromium/bin', 'Chromium binary assets must be traced');
includes('next.config.mjs', '/api/admin/orders/[orderReference]/generate-report', 'Report route tracing must remain');
includes('next.config.mjs', "'@sparticuz/chromium': 'commonjs @sparticuz/chromium'", 'Chromium must remain external');
includes('next.config.mjs', "'puppeteer-core': 'commonjs puppeteer-core'", 'Puppeteer must remain external');
excludes('next.config.mjs', 'serverExternalPackages', 'Next 15-only config must not be introduced');
excludes('next.config.mjs', 'turbopack', 'Invalid Turbopack config must not be introduced');

const assemble = 'src/lib/reports/assemble-report-data.ts';
includes(assemble, 'score_runs', 'Assembly must read persisted score runs');
includes(assemble, 'score_domain_results', 'Assembly must read persisted domain results');
includes(assemble, 'score_question_traces', 'Assembly must read persisted question traces');
includes(assemble, 'orderStatus: order.status', 'Assembly must carry order status into the shared guard');
includes(assemble, 'amountCents: nullableNumber(order.amount_cents)', 'Assembly must carry paid order amount into the shared guard');
excludes(assemble, "'verified'", 'Legacy verified status must not enable generation');
assert(!/overallScore\s*[+\-*/]/.test(read(assemble)), 'Assembly must not recalculate overall score');

const entitlement = 'src/lib/reports/report-entitlement.ts';
includes(entitlement, 'ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS = 500000', 'Report generation must remain restricted to the R5,000 product');
includes(entitlement, "PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS = 'payment_received'", 'Report generation must remain payment gated');
includes(entitlement, "ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE = 'essential_self_assessment'", 'Report generation must remain restricted to the essential product');
includes(entitlement, 'mk_validated_assessment', 'R50,000 personalised engagement must be explicitly rejected');
includes(entitlement, 'Free products are not eligible', 'Free products must be explicitly rejected');

const fallback = 'src/lib/reports/fallback-content.ts';
includes(fallback, 'FALLBACK_DOMAIN_CONTENT', 'Deterministic domain fallback must remain');
includes(fallback, 'FALLBACK_FALSE_COMFORT_CAPPED', 'Capped false-comfort fallback must remain');
includes(fallback, 'FALLBACK_FALSE_COMFORT_GENERAL', 'Gap fallback must remain');
includes(fallback, 'FALLBACK_FALSE_COMFORT_CLEAN', 'Clean fallback must remain');

const selector = 'src/lib/reports/select-content-blocks.ts';
includes(selector, 'getDomainFallback(domain.domainName, band)', 'Fallback must remain domain specific');
includes(selector, 'item.domainCode === domain.domainCode', 'Domain content must match persisted codes');
includes(selector, 'item.domainCode === gap.domainCode', 'Gap content must match persisted codes');
excludes(selector, 'item.domainCode === domain.domainName', 'Display names must not be used as identifiers');

const roadmap = 'src/lib/reports/roadmap.ts';
includes(roadmap, 'agenda', 'Roadmap must retain one deterministic agenda');
includes(roadmap, 'action30', '30-day actions must remain');
includes(roadmap, 'action60', '60-day actions must remain');
includes(roadmap, 'action90', '90-day actions must remain');

const renderer = 'src/lib/reports/render-pdf.ts';
includes(renderer, "import('puppeteer-core')", 'Renderer must use puppeteer-core');
includes(renderer, "import('@sparticuz/chromium')", 'Renderer must use packaged Chromium');
excludes(renderer, 'AWS_LAMBDA_JS_RUNTIME', 'Renderer must not spoof the Lambda runtime');
excludes(renderer, 'AWS_EXECUTION_ENV', 'Renderer must not spoof the Lambda execution environment');
includes(renderer, 'chromium.executablePath()', 'Renderer must use the supported zero-argument executable path resolution');
includes(renderer, 'puppeteer.defaultArgs', 'Renderer must merge Puppeteer and Sparticuz launch arguments');
includes(renderer, 'Chromium runtime diagnostics', 'Renderer must preserve safe diagnostics');
includes(renderer, 'resolveChromiumExecutablePath', 'Renderer must resolve the executable explicitly');
excludes(renderer, "import('puppeteer')", 'Renderer must not depend on bundled browser downloads');

const service = 'src/lib/reports/premium-report-service-core.ts';
includes(service, 'validatePremiumReportGenerationEntitlement', 'Shared service must enforce the premium entitlement guard');
includes(service, 'renderHtmlToPdfBuffer', 'Shared service must render PDFs');
includes(service, 'commit_premium_report_draft', 'Shared service must transactionally persist report drafts');
includes(service, "manualFunction: 'publish_premium_report_generation'", 'Manual version supersession must use the gated publication RPC');
includes(service, "workerFunction: 'worker_publish_premium_report_generation'", 'Autonomous version supersession must use the capability-scoped publication RPC');
includes(service, 'superseded_report_id', 'Version supersession must remain');
includes(service, "from('report_events')", 'Report events must be recorded');
includes(service, "from('audit_logs')", 'Audit logs must be recorded');
excludes(service, "mk_validated_assessment: 'mk_validated'", 'R50,000 personalised engagement must not map to a generated report type');

const generateRoute = 'src/app/api/admin/orders/[orderReference]/generate-report/route.ts';
includes(generateRoute, 'generatePremiumReport', 'Admin route must delegate to shared service');
includes(generateRoute, 'REPORT_GENERATION_ROLES', 'Admin route must remain role protected');
includes(generateRoute, 'ReportEntitlementError', 'Admin route must return controlled entitlement conflicts');
excludes(generateRoute, 'renderHtmlToPdfBuffer', 'Route must not duplicate PDF logic');

const download = 'src/app/api/admin/reports/[reportId]/download/route.ts';
includes(download, 'downloadPremiumReport', 'Downloads must stream through the shared verified service');
excludes(download, 'createSignedUrl', 'Downloads must not issue raw signed storage URLs');
includes('src/lib/reports/download-verification.ts', 'sha256', 'Downloads must verify the runtime object checksum');
excludes(download, 'publicUrl', 'Reports must not expose public storage URLs');

const template = read('src/lib/reports/templates/report-template.ts');
for (const heading of ['False Comfort', '30/60/90-Day Roadmap', 'Leadership Agenda', 'Version Record']) {
  assert(template.includes(heading), `Template must include ${heading}`);
}
assert(!/benchmark|peer average/i.test(template), 'Template must not claim unsupported benchmarks');
assert(!/Phase 9|Phase 10/.test(template), 'Template must not expose internal phase labels');

const optionalPdfInfo = path.join(root, 'tmp', 'phase10-rendered-pdfinfo.txt');
if (fs.existsSync(optionalPdfInfo)) {
  const pages = Number(fs.readFileSync(optionalPdfInfo, 'utf8').match(/^Pages:\s+(\d+)$/m)?.[1]);
  if (pages) assert(pages >= 18 && pages <= 24, `Rendered PDF page count must remain 18-24; got ${pages}`);
}

console.log('Phase 10 premium report tests passed on the Node 24 compatibility boundary. Deterministic assembly, shared payment gating, private storage, versioning and Chromium packaging remain protected.');
