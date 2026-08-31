/**
 * The Fraud Readiness Assessment Terms, as displayed.
 *
 * Kept as data rather than markup so the wording is in one readable place and can be diffed clause
 * by clause when a version is bumped. The clauses are drafted conservatively for South African law
 * and still require sign-off by a South African legal practitioner before release; that status is
 * tracked internally through LEGAL_REVIEW_STATUS and is never shown to a customer.
 *
 * Two drafting constraints deliberately observed:
 *
 *  - No blanket exclusion of liability. A clause purporting to exclude all liability in all
 *    circumstances is, in South Africa, exposed under the Consumer Protection Act and to public
 *    policy challenge, and would risk the whole limitation being read down. The limitation below
 *    is capped, carved out for what cannot lawfully be excluded, and time-barred instead.
 *  - No promise the products cannot keep. Nothing here says the assessment verifies evidence,
 *    reviews controls, or provides assurance, because Essential and Comprehensive do none of those
 *    things — that is Advisory work and is described as such.
 */

export type TermsClause = { heading: string; paragraphs: readonly string[] };
export type TermsSection = { id: string; title: string; clauses: readonly TermsClause[] };

export const FRAUD_READINESS_TERMS_SECTIONS: readonly TermsSection[] = Object.freeze([
  {
    id: 'scope',
    title: '1. Scope and acceptance',
    clauses: [
      {
        heading: '1.1 What these terms cover',
        paragraphs: [
          'These terms govern your use of the MK Fraud Insights Fraud Readiness Assessment and any Snapshot, Essential or Comprehensive output prepared from it. They are entered into between you and Stonda (Pty) Ltd trading as MK Fraud Insights ("MK Fraud Insights", "we", "us").',
          'You accept these terms by ticking the acceptance boxes presented before an assessment is created. We record the version of these terms and of the Privacy Notice that you accepted, together with the date and time of acceptance.'
        ]
      },
      {
        heading: '1.2 Authority to provide information',
        paragraphs: [
          'You confirm that you are authorised by the organisation you name to provide the information you enter, and that providing it does not breach any confidentiality obligation, employment term or legal restriction binding on you or on that organisation.',
          'If you are not so authorised, you must not complete the assessment.'
        ]
      },
      {
        heading: '1.3 Advisory engagements are separate',
        paragraphs: [
          'An MK Advisory engagement is scoped, priced and contracted separately in writing. Nothing on this platform creates an Advisory engagement, and these terms do not govern one.'
        ]
      }
    ]
  },
  {
    id: 'nature',
    title: '2. Nature and limitations of the assessment',
    clauses: [
      {
        heading: '2.1 The responses are self-reported',
        paragraphs: [
          'The assessment records what you tell us about your organisation. We do not test, audit, inspect or otherwise verify your responses, and we do not examine whether the controls you describe exist or operate as described.',
          'The usefulness of any output therefore depends on the accuracy and completeness of the information you provide.'
        ]
      },
      {
        heading: '2.2 What the outputs are',
        paragraphs: [
          'The Snapshot, Essential and Comprehensive outputs are structured analyses of your self-reported responses, prepared to support management judgement.',
          'They are not an audit, a review engagement, an agreed-upon-procedures engagement, an investigation, a forensic examination, a legal opinion, an accounting opinion or a regulatory submission, and they must not be presented to any third party as if they were.'
        ]
      },
      {
        heading: '2.3 No verification, independent review or assurance',
        paragraphs: [
          'Essential and Comprehensive do not include verification of evidence, independent review of your control environment, or any form of assurance opinion. No output represents that any person has reviewed or validated your organisation’s information unless that review is separately contracted as an Advisory engagement and is expressly described in the deliverable.',
          'Where independent examination is required, it is available only through a separately scoped MK Advisory engagement.'
        ]
      },
      {
        heading: '2.4 No guarantee of detection or prevention',
        paragraphs: [
          'Fraud readiness is a measure of preparedness, not of outcome. Nothing we provide guarantees that fraud will be detected, prevented or avoided, that all fraud risks have been identified, or that your organisation is compliant with any law, standard or contractual obligation.'
        ]
      },
      {
        heading: '2.5 Management remains responsible',
        paragraphs: [
          'Responsibility for your organisation’s fraud risk management, internal controls, governance and for any decision taken in reliance on an output remains with your management and governing body at all times.',
          'You should obtain your own professional, legal or regulatory advice where a decision requires it.'
        ]
      },
      {
        heading: '2.6 Point in time',
        paragraphs: [
          'Each output reflects the responses submitted at the time of the assessment and the methodology version then in force. It is not updated for later changes in your organisation, in the fraud environment, or in our methodology.'
        ]
      }
    ]
  },
  {
    id: 'automation',
    title: '3. Use of automated tools',
    clauses: [
      {
        heading: '3.1 Automated preparation',
        paragraphs: [
          'We use automated tools, including artificial intelligence, under our control and within defined limits, to help prepare the analysis and written content of our outputs. The methodology, scoring rules and the boundaries within which those tools operate are set by MK Fraud Insights.',
          'The use of automated tools does not change what an output is: it remains an analysis of self-reported information and is not an assurance product.'
        ]
      },
      {
        heading: '3.2 Accuracy',
        paragraphs: [
          'We apply controls intended to keep generated content consistent with your submitted responses and with our methodology. You should nevertheless read each output critically and tell us promptly if anything appears inconsistent with your organisation’s position, so that we can consider a correction.'
        ]
      }
    ]
  },
  {
    id: 'information',
    title: '4. Confidentiality and information handling',
    clauses: [
      {
        heading: '4.1 Confidentiality',
        paragraphs: [
          'We treat the information you submit as confidential. We do not disclose it to any third party except to service providers engaged to operate the platform under confidentiality obligations, where you direct us to, or where disclosure is required by law.'
        ]
      },
      {
        heading: '4.2 Personal information',
        paragraphs: [
          'Personal information is processed in accordance with the Privacy Notice and the Protection of Personal Information Act 4 of 2013. The Privacy Notice explains what we collect, why, how long we keep it and the rights available to you.'
        ]
      },
      {
        heading: '4.3 Optional product-improvement consent',
        paragraphs: [
          'Separately from these terms, you may consent to anonymised assessment information being used to improve our products and methodology. That consent is optional, is requested separately, is not a condition of using the assessment or of receiving any output, and may be declined or withdrawn without affecting the service you receive.'
        ]
      },
      {
        heading: '4.4 Security',
        paragraphs: [
          'We take reasonable technical and organisational measures to protect the information you submit. No method of transmission or storage is entirely secure, and we do not warrant that our systems will be uninterrupted or free from unauthorised access.'
        ]
      }
    ]
  },
  {
    id: 'ip',
    title: '5. Intellectual property and use of outputs',
    clauses: [
      {
        heading: '5.1 Our intellectual property',
        paragraphs: [
          'The assessment, its questions, the methodology, scoring approach, report structures, templates and all related materials are and remain the intellectual property of MK Fraud Insights. Nothing in these terms transfers ownership of them.'
        ]
      },
      {
        heading: '5.2 Your information',
        paragraphs: [
          'You retain ownership of the information you submit. You grant us a licence to use it for the purpose of preparing and delivering the outputs you have requested and of operating and supporting the platform.'
        ]
      },
      {
        heading: '5.3 Internal-use licence',
        paragraphs: [
          'On delivery, we grant your organisation a non-exclusive, non-transferable licence to use each output for its own internal purposes, including sharing it with its directors, employees, auditors and professional advisers who need it and who are bound by confidentiality.',
          'You may not publish, resell, sublicense or distribute an output externally, or use it in marketing or in a dispute with a third party, without our prior written consent. Any permitted extract must retain the stated limitations of the output.'
        ]
      }
    ]
  },
  {
    id: 'commercial',
    title: '6. Payment, delivery and cancellation',
    clauses: [
      {
        heading: '6.1 Prices',
        paragraphs: [
          'Current prices for Essential and Comprehensive are those shown on the platform at the time you place your order, and are the prices that apply to that order. Advisory fees are agreed in the applicable engagement contract.',
          'A change to our published prices does not affect an order already placed.'
        ]
      },
      {
        heading: '6.2 Order and payment',
        paragraphs: [
          'A paid output is prepared once the assessment has been submitted and payment for the chosen product has been received and confirmed. Payments are processed by our payment provider; we do not store your card details.'
        ]
      },
      {
        heading: '6.3 Delivery',
        paragraphs: [
          'We prepare and make available each paid output after payment is confirmed. We will tell you where an output will be delivered and how it may be accessed. Delivery timeframes communicated to you are estimates unless we state otherwise in writing.'
        ]
      },
      {
        heading: '6.4 Cancellation and refunds',
        paragraphs: [
          'You may cancel an order at any time before preparation of the output has begun, and we will refund amounts paid for that order.',
          'Once preparation has begun, an order may not ordinarily be cancelled, because the output is prepared specifically for your organisation from your submitted responses. If you believe an output is materially defective or materially inconsistent with your submitted responses, tell us within 14 days of delivery and we will investigate and, where we agree, correct it, reissue it or refund it.',
          'Nothing in this clause limits any right you have under the Consumer Protection Act 68 of 2008 or other applicable law.'
        ]
      }
    ]
  },
  {
    id: 'liability',
    title: '7. Limitation of liability',
    clauses: [
      {
        heading: '7.1 What we do not exclude',
        paragraphs: [
          'Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, for gross negligence, or for any other liability that cannot lawfully be excluded or limited under South African law, including under the Consumer Protection Act 68 of 2008 where it applies.'
        ]
      },
      {
        heading: '7.2 Reliance',
        paragraphs: [
          'Because our outputs analyse self-reported information that we do not verify, we are not liable for any loss arising from information that was inaccurate, incomplete or out of date when it was submitted to us.'
        ]
      },
      {
        heading: '7.3 Cap on liability',
        paragraphs: [
          'Subject to clause 7.1, our total aggregate liability arising out of or in connection with the assessment and any output prepared from it, whether in contract, delict or otherwise, is limited to the amount you paid to us for the output giving rise to the claim, or ZAR 10,000 where no amount was paid.',
          'Subject to clause 7.1, we are not liable for indirect or consequential loss, loss of profit, loss of anticipated savings, loss of business opportunity or reputational loss.'
        ]
      },
      {
        heading: '7.4 Time limit for claims',
        paragraphs: [
          'Subject to clause 7.1, any claim must be brought within 12 months of the date on which the output giving rise to it was delivered.'
        ]
      },
      {
        heading: '7.5 Third parties',
        paragraphs: [
          'Outputs are prepared for your organisation. We accept no responsibility or liability to any third party who obtains or relies on an output, whether with or without your consent.'
        ]
      }
    ]
  },
  {
    id: 'law',
    title: '8. Governing law, disputes and general',
    clauses: [
      {
        heading: '8.1 Governing law',
        paragraphs: [
          'These terms and any dispute arising from them are governed by the law of the Republic of South Africa.'
        ]
      },
      {
        heading: '8.2 Resolving a dispute',
        paragraphs: [
          'If a dispute arises, the parties will first attempt in good faith to resolve it by discussion between senior representatives within 15 business days of written notice of the dispute.',
          'If it is not resolved, the parties will refer it to mediation administered by an accredited South African mediation body before commencing litigation, unless urgent interim relief is required.'
        ]
      },
      {
        heading: '8.3 Jurisdiction',
        paragraphs: [
          'The parties submit to the jurisdiction of the South African courts. Where you are a consumer as defined in the Consumer Protection Act 68 of 2008, nothing in this clause limits your right to approach a court, an ombud or the National Consumer Commission as that Act permits.'
        ]
      },
      {
        heading: '8.4 Version control',
        paragraphs: [
          'These terms are versioned. The version you accepted, and the date and time of your acceptance, are recorded when your assessment is created and are the version that governs that assessment.',
          'We may publish a new version for future assessments. A new version does not change the terms that already govern an assessment you have started.'
        ]
      },
      {
        heading: '8.5 Relationship to other terms',
        paragraphs: [
          'These terms apply specifically to the Fraud Readiness Assessment and the outputs prepared from it, and take precedence over the general Terms of Use for that purpose. The Privacy Notice governs the processing of personal information and forms part of the agreement between us.',
          'If any provision is found to be unenforceable, it is to be read down to the minimum extent necessary and the remaining provisions continue in force.'
        ]
      },
      {
        heading: '8.6 Contact',
        paragraphs: [
          'Questions about these terms may be sent to hello@mkfraud.co.za.'
        ]
      }
    ]
  }
]);
