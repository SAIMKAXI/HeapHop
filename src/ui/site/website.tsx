"use client";

// True on the website, where the other pages exist. The VS Code webview shows the
// editor on its own, so there its header has no links.
import { createContext, useContext, type ReactNode } from "react";

const OnWebsite = createContext(false);

export function WebsiteProvider({ children }: { children: ReactNode }) {
  return <OnWebsite value>{children}</OnWebsite>;
}

export const useOnWebsite = () => useContext(OnWebsite);
