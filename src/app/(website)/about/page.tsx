import Wrapper from "@/components/website/Wrapper";
import { CtaLink } from "@/components/website/primitives/CtaLink";
import { Eyebrow } from "@/components/website/primitives/Eyebrow";

const commitments = [
  {
    title: "We start from exposure, not from a framework",
    body: "Engagements begin with how the organisation actually operates: its customer journeys, supplier relationships, payment processes and the decisions staff make every day. Frameworks are used where they help, never as the starting point.",
  },
  {
    title: "We make the position discussable at management level",
    body: "Our output is written for the people who allocate budget and accountability. That means a clear view of exposure, an honest reading of control coverage and a short list of priorities, rather than a long catalogue of findings.",
  },
  {
    title: "We design for the people who have to run it",
    body: "Controls, escalation routes and playbooks are built around existing systems and teams, so they can be operated after MK has left the room.",
  },
];

const scope = [
  "MK is an advisory practice. We do not conduct forensic investigations or provide regulatory audit opinions.",
  "The Fraud Readiness Assessment analyses what an organisation reports. It does not independently test evidence or provide assurance.",
  "We do not promise zero fraud. We help organisations understand and reduce their exposure in a deliberate, prioritised way.",
];

export default function About() {
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="bg-[#001030] text-white" aria-labelledby="about-heading">
          <div className="mx-auto w-full max-w-7xl px-5 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:py-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">About MK Fraud Insights</p>
            <h1 id="about-heading" className="mt-4 max-w-[18ch] text-[2.1rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Specialist fraud risk advice for organisations beyond the banks.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
              MK Fraud Insights is an independent South African fraud risk advisory practice. We help leadership teams
              understand where fraud exposure sits, whether their controls genuinely address it and what to prioritise.
            </p>
          </div>
        </section>

        <section className="bg-white" aria-labelledby="about-origin-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <Eyebrow>Why MK exists</Eyebrow>
              <h2 id="about-origin-heading" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl">
                Fraud risk does not stop at financial services.
              </h2>
            </div>
            <div className="space-y-4 text-base leading-7 text-slate-600">
              <p>
                Banks and insurers have spent decades building dedicated fraud functions. Retailers, logistics
                operators, public bodies, manufacturers and fast-growing digital businesses face many of the same
                threats, often through their suppliers, payments and frontline processes, but rarely with a fraud
                programme designed for them.
              </p>
              <p>
                The practice is led by a fraud risk practitioner whose operational experience spans fraud risk,
                governance, process design and solution strategy. MK applies that experience to organisations where
                fraud has usually been managed in fragments, and Fraud Readiness is built from the same practitioner
                insight.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="about-how-heading">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <Eyebrow>How we work</Eyebrow>
            <h2 id="about-how-heading" className="mt-4 max-w-2xl text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl">
              Three commitments that shape every engagement.
            </h2>
            <div className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-12">
              {commitments.map((item) => (
                <article key={item.title} className="border-t-2 border-[#001030] pt-5">
                  <h3 className="text-lg font-semibold leading-snug text-[#001030]">{item.title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white" aria-labelledby="about-scope-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <Eyebrow>Scope and independence</Eyebrow>
              <h2 id="about-scope-heading" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl">
                The limits of our work are stated upfront.
              </h2>
            </div>
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {scope.map((line) => (
                <li key={line} className="flex gap-4 py-4 text-base leading-7 text-[#001030]">
                  <span aria-hidden="true" className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1d3658]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-7xl px-5 pb-14 sm:px-6 sm:pb-20 lg:px-8">
            <div className="rounded-[1.5rem] bg-[#001030] px-4 py-8 text-white min-[360px]:px-5 sm:px-10 sm:py-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14 lg:py-12">
              <div className="max-w-xl">
                <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Talk to MK about your organisation.</h2>
                <p className="mt-3 text-base leading-7 text-white/75">
                  Tell us what you are trying to understand or fix, and we will suggest a sensible place to start.
                </p>
              </div>
              <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap lg:mt-0 lg:shrink-0">
                <CtaLink href="/contact" variant="primaryOnDark" arrow ctaName="speak_to_mk" placement="about_closing">
                  Speak to MK
                </CtaLink>
                <CtaLink href="/services" variant="secondaryOnDark" ctaName="view_services" placement="about_closing">
                  View services
                </CtaLink>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Wrapper>
  );
}
