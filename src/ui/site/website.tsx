"use client";

// True on the website, where the other pages exist. The VS Code webview shows the
// editor on its own, so there its header has no links. On the website the server also
// says who is signed in, for the header (name and role only: nothing secret).
import { createContext, useContext, type ReactNode } from "react";

export interface SessionInfo {
  name: string;
  admin: boolean;
}

const OnWebsite = createContext(false);
const Session = createContext<SessionInfo | null>(null);

export function WebsiteProvider({ children, session = null }: { children: ReactNode; session?: SessionInfo | null }) {
  return (
    <OnWebsite value>
      <Session value={session}>{children}</Session>
    </OnWebsite>
  );
}

export const useOnWebsite = () => useContext(OnWebsite);
export const useSession = () => useContext(Session);
