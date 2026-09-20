import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import Wrapper from '@/components/website/Wrapper';
import MethodologyTrust from '@/components/website/MethodologyTrust';
import { CtaLink } from '@/components/website/primitives/CtaLink';
import { Eyebrow } from '@/components/website/primitives/Eyebrow';
import {
  AI_FRAUD_EVIDENCE,
  AI_FRAUD_SOURCES,
  AI_FRAUD_VECTORS,
  AI_READINESS_CONDITIONS,
  FRAUD_READINESS_AI_COVERAGE,
  sourceById
} from '@/lib/website/ai-fraud';

const capabilityResponse = [
  {
    name: 'Assess',
    href: '/services#assess',
    body: 'Establish where AI-enabled methods could reach your organisation, which decisions currently depend on recognising a person or a document, and where that leaves you exposed.'
  },
  {
    name: 'Build',
    href: '/services#build',
    body: 'Design verification, authorisation and escalation that hold when identity, voice and evidence can be fabricated, and place accountability for those controls with named owners.'
  },
  {
    name: 'Enable',
    href: '/services#enable',
    body: 'Prepare frontline staff, managers and executives to act on the possibility that what they are seeing or hearing was generated, and to confirm before they commit the organisation.'
  },
  {
    name: 'Monitor',
    href: '/services#monitor',
    body: 'Interpret developments in AI-enabled fraud as they occur and translate them into specific changes to your controls, systems, people and customer journeys.'
  }
];

export default function AiFraudReadinessPage() {
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="relative overflow-hidden bg-[#001030] text-white" aria-labelledby="ai-fraud-heading">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(169,212,206,0.14),transparent_42%)]"
          />
          <div className="relative mx-auto w-full max-w-7xl px-5 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:py-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">AI-enabled fraud</p>
            <h1
              id="ai-fraud-heading"
              className="mt-4 max-w-[19ch] text-[2.1rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.6rem]"
            >
              How prepared is your organisation for AI-enabled fraud?
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
              Fraud has not changed its purpose. What has changed is that a familiar voice, a recognisable face, a
              professional email and a convincing document can all be generated. Controls that quietly depend on a person
              recognising something as genuine are the ones most exposed.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <CtaLink href="/contact" variant="primaryOnDark" arrow ctaName="speak_to_mk_about_ai_fraud" placement="ai_fraud_hero">
                Speak to MK about AI fraud
              </CtaLink>
              <CtaLink href="/fraud-readiness" variant="secondaryOnDark" ctaName="explore_fraud_readiness" placement="ai_fraud_hero">
                Explore Fraud Readiness
              </CtaLink>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-[#f8fafc]" aria-label="Published evidence on AI-enabled fraud">
          <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 sm:py-12 lg:px-8">
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {AI_FRAUD_EVIDENCE.map((point) => {
                const source = sourceById(point.sourceId);
                return (
                  <li key={point.figure + point.sourceId} className="border-t-2 border-[#001030] pt-4">
                    <p className="text-3xl font-semibold tracking-tight text-[#001030]">{point.figure}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{point.statement}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {source.publisher}, {source.published}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="bg-white" aria-labelledby="ai-changes-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <Eyebrow>What AI changes</Eyebrow>
              <h2
                id="ai-changes-heading"
                className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl"
              >
                The familiar signals of trust are weakening.
              </h2>
            </div>
            <div className="space-y-4 text-base leading-7 text-slate-600">
              <p>
                AI-enabled fraud is fraud strengthened by artificial intelligence, used to automate the work, scale it
                across many targets, personalise each attempt, fabricate identities, media and documents, or run parts of
                a campaign with little human involvement, spanning generative techniques that produce convincing content
                and agentic techniques that carry out sequences of actions.
              </p>
              <p>
                Most organisations have built their fraud defences around recognition. A caller sounds like the finance
                director, an invoice looks like the one that arrives every month, a supplier letter carries the right
                logo, an applicant presents documents that appear consistent. Those judgements were reasonable while
                producing a convincing fake took skill, time and money.
              </p>
              <p>
                Generative tools have removed that cost. Voice, video, correspondence and supporting documents can now be
                produced quickly, cheaply and at a quality that a trained person cannot reliably distinguish, and the same
                tooling personalises each attempt using information that is already public. INTERPOL describes this as the
                industrialisation of fraud, and reports AI-enhanced fraud as substantially more profitable for criminals
                than traditional methods.
              </p>
              <p>
                The practical consequence for management is narrow and serious. Any control whose strength rests on
                someone recognising a person, a voice or a document has quietly weakened, and it has weakened without any
                change to your systems, your policies or your risk register.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="ai-vectors-heading">
          <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <Eyebrow>Where it shows up</Eyebrow>
              <h2
                id="ai-vectors-heading"
                className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl"
              >
                The methods that reach ordinary business processes.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                These are not exotic scenarios. Each one lands in a process most organisations already run, usually where
                a person is expected to make a judgement quickly.
              </p>
            </div>

            <ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200 lg:mt-12">
              {AI_FRAUD_VECTORS.map((vector) => (
                <li key={vector.id} className="grid gap-2 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:gap-12 lg:py-6">
                  <h3 className="text-lg font-semibold leading-snug text-[#001030]">{vector.name}</h3>
                  <div>
                    <p className="text-[15px] leading-7 text-slate-600">{vector.description}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.12em] text-slate-500">
                      Typically lands in: <span className="normal-case tracking-normal text-slate-600">{vector.whereItLands}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bg-white" aria-labelledby="ai-governance-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <Eyebrow>Where it belongs</Eyebrow>
              <h2
                id="ai-governance-heading"
                className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl"
              >
                A governance and control-design problem, not only a cybersecurity one.
              </h2>
            </div>
            <div className="space-y-4 text-base leading-7 text-slate-600">
              <p>
                It is tempting to hand AI-enabled fraud to the security function, because the tooling is technical. That
                reading misplaces the risk. In most of these cases nothing is hacked. An authorised person is persuaded to
                do something they are entitled to do: release a payment, change banking details, approve an account, accept
                a document as proof.
              </p>
              <p>
                Detection technology has its place, and the market is moving: in the ACFE and SAS benchmarking study a
                quarter of organisations now use AI or machine learning in their anti-fraud programmes. Tools alone do not
                decide the outcome. The decisions that matter are governance decisions. Which actions require verification
                that cannot be satisfied by a convincing voice or document? Who is allowed to authorise an exception, and
                on what evidence? How does a junior employee challenge an instruction from someone senior without career
                risk? Who owns the question of what a new fraud method means for this organisation?
              </p>
              <p>
                Those are management questions, and they sit inside the fraud programme rather than inside the security
                stack.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="ai-readiness-heading">
          <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <Eyebrow>What readiness looks like</Eyebrow>
              <h2
                id="ai-readiness-heading"
                className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl"
              >
                Six conditions a ready organisation can demonstrate.
              </h2>
            </div>
            <div className="mt-8 grid gap-x-12 gap-y-8 lg:mt-12 lg:grid-cols-2">
              {AI_READINESS_CONDITIONS.map((condition) => (
                <article key={condition.title} className="border-t-2 border-[#001030] pt-4">
                  <h3 className="text-lg font-semibold leading-snug text-[#001030]">{condition.title}</h3>
                  <p className="mt-2 text-[15px] leading-7 text-slate-600">{condition.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white" aria-labelledby="ai-mk-heading">
          <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <Eyebrow>How MK helps</Eyebrow>
              <h2 id="ai-mk-heading" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl">
                AI-enabled fraud runs through the same four capabilities.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                MK does not treat this as a separate practice. It is an evolving fraud-risk vector, addressed through the
                way MK already works.
              </p>
            </div>
            <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
              {capabilityResponse.map((item) => (
                <li key={item.name} className="bg-white">
                  <Link
                    href={item.href}
                    className="group flex h-full flex-col p-5 transition-colors hover:bg-[#fbfcfd] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1d3658] lg:p-7"
                  >
                    <h3 className="text-2xl font-semibold tracking-tight text-[#001030]">{item.name}</h3>
                    <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{item.body}</p>
                    <span className="mt-4 inline-flex min-h-6 items-center gap-1.5 text-sm font-semibold text-[#001030]">
                      About {item.name.toLowerCase()}
                      <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="ai-instrument-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <Eyebrow>Where Fraud Readiness fits</Eyebrow>
              <h2
                id="ai-instrument-heading"
                className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl"
              >
                What the assessment covers today.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                We would rather be precise about this than imply more than the instrument currently does.
              </p>
            </div>
            <div>
              <p className="text-base leading-7 text-slate-600">
                The Fraud Readiness Assessment examines the control environment that AI-enabled fraud has to pass through.
                Its digital and identity domain covers:
              </p>
              <ul className="mt-4 space-y-2.5">
                {FRAUD_READINESS_AI_COVERAGE.coveredToday.map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] leading-6 text-[#001030]">
                    <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1d3658]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {!FRAUD_READINESS_AI_COVERAGE.explicitAiQuestions ? (
                <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-[15px] leading-7 text-slate-600">
                  The current questionnaire does not yet ask about deepfakes, voice cloning or synthetic identities by
                  name, so it should not be read as a comprehensive test of those specific exposures.{' '}
                  {FRAUD_READINESS_AI_COVERAGE.plannedExpansion} AI-specific exposure is examined directly in an advisory
                  engagement in the meantime.
                </p>
              ) : null}
              <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
                <CtaLink href="/fraud-readiness" variant="primary" arrow ctaName="explore_fraud_readiness" placement="ai_fraud_instrument">
                  Explore Fraud Readiness
                </CtaLink>
                <CtaLink href="/score/start" variant="secondary" ctaName="assess_core_fraud_readiness" placement="ai_fraud_instrument">
                  Assess your core fraud readiness
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        <MethodologyTrust tone="dark" />

        <section className="border-t border-slate-200 bg-white" aria-labelledby="ai-sources-heading">
          <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
            <h2 id="ai-sources-heading" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Sources
            </h2>
            <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {AI_FRAUD_SOURCES.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-12 items-start justify-between gap-4 py-3 text-[15px] leading-6 text-[#001030] hover:text-[#1d3658]"
                  >
                    <span>
                      <span className="font-semibold">{source.publisher}</span>, {source.title}, {source.published}
                    </span>
                    <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#1d3658]" />
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-[1.5rem] bg-[#001030] px-4 py-8 text-white min-[360px]:px-5 sm:px-10 sm:py-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14">
              <div className="max-w-xl">
                <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                  Test whether your controls still hold.
                </h2>
                <p className="mt-3 text-base leading-7 text-white/75">
                  Speak to MK about the AI-enabled exposure specific to your organisation, or use the Fraud Readiness
                  Assessment to understand your core fraud readiness first.
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap lg:mt-0 lg:shrink-0">
                <CtaLink href="/contact" variant="primaryOnDark" arrow ctaName="speak_to_mk_about_ai_fraud" placement="ai_fraud_closing">
                  Speak to MK about AI fraud
                </CtaLink>
                <CtaLink href="/score/start" variant="secondaryOnDark" ctaName="assess_core_fraud_readiness" placement="ai_fraud_closing">
                  Assess your core fraud readiness
                </CtaLink>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Wrapper>
  );
}
