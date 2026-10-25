"use client";
import { Children, useEffect, useRef, type ReactNode } from "react";
import { CAPABILITIES } from "@/lib/website/capabilities";

/** Native disclosures keep the complete service content available, including without enhancement. */
export function CapabilityDirectory({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const contents = Children.toArray(children);
  useEffect(() => {
    const reveal = () => {
      let id = "";
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      const disclosure = target?.closest<HTMLDetailsElement>(
        "details[data-capability]",
      );
      if (disclosure && root.current?.contains(disclosure))
        disclosure.open = true;
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return (
    <div ref={root} className="border-t border-mk-line">
      {CAPABILITIES.map((capability, index) => (
        <details
          key={capability.id}
          data-capability={capability.id}
          open={index === 0}
          className="group/capability border-b border-mk-line"
        >
          <summary className="mx-auto grid min-h-20 max-w-[1600px] cursor-pointer grid-cols-[1fr_auto] items-center gap-3 px-5 py-5 text-mk-navy sm:px-8 md:grid-cols-[180px_1fr_auto]">
            <strong className="text-xl font-semibold">{capability.name}</strong>
            <span className="col-start-1 text-base leading-relaxed text-mk-muted md:col-auto">
              {capability.question}
            </span>
            <span
              aria-hidden="true"
              className="col-start-2 row-start-1 text-xl md:col-auto"
            >
              <span className="group-open/capability:hidden">+</span><span className="hidden group-open/capability:inline">−</span>
            </span>
          </summary>
          {contents[index]}
        </details>
      ))}
    </div>
  );
}
