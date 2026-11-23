"use client";

// True on the website, where the other pages exist. The VS Code webview shows the
// editor on its own, so there its header has no links. On the website the server also
// says whether someone is signed in and if they are an admin (nothing personal).
import { createContext, useContext, type ReactNode } from "react";
import { NavHistory } from "./nav-history-client";

/** Only what the header needs. The name and email are never sent to the page for this. */
export interface SessionInfo {
  admin: boolean;
}

const OnWebsite = createContext(false);
const Session = createContext<SessionInfo | null>(null);

export function WebsiteProvider({ children, session = null }: { children: ReactNode; session?: SessionInfo | null }) {
  return (
    <OnWebsite value>
      <Session value={session}>
        <NavHistory />
        {children}
      </Session>
    </OnWebsite>
  );
}

export const useOnWebsite = () => useContext(OnWebsite);
export const useSession = () => useContext(Session);
