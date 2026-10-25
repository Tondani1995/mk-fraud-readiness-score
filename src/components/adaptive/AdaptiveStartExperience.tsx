"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { AssessmentOrientation } from "@/components/adaptive/AssessmentOrientation";
import { AdaptiveAssessmentExperience } from "@/components/adaptive/AdaptiveAssessmentExperience";

type StartedSession = {
  assessmentReference: string;
  token: string;
  initialState: any;
};
const StartSessionContext = createContext<
  ((session: StartedSession) => void) | null
>(null);
export const useAdaptiveStartSession = () => useContext(StartSessionContext);

/** The first question uses only the authoritative state returned after creation commits.
 * No session is created early, persisted in browser storage, or inferred from a local graph.
 */
export function AdaptiveStartExperience({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<StartedSession | null>(null);
  return (
    <StartSessionContext.Provider value={setSession}>
      {session ? (
        <div className="assessment-session-entry">
          {!ready ? (
            <AssessmentOrientation
              scale={session.initialState.responseScale ?? []}
              onBegin={() => setReady(true)}
            />
          ) : (
            <AdaptiveAssessmentExperience
              assessmentReference={session.assessmentReference}
              token={session.token}
              initialState={session.initialState}
            />
          )}
        </div>
      ) : (
        children
      )}
    </StartSessionContext.Provider>
  );
}
