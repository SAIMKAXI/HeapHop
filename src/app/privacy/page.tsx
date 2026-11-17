import type { Metadata } from "next";
import { PageFrame } from "@/ui/site/page-frame";

export const metadata: Metadata = { title: "Privacy policy", description: "What HeapHop stores, and what it does not." };

const h2 = "mt-10 text-xl font-bold first:mt-0";
const p = "mt-3 leading-relaxed text-muted-foreground";
const link = "font-semibold text-accent underline-offset-4 hover:underline";

export default function PrivacyPage() {
  return (
    <PageFrame current="privacy" title="Privacy policy" intro="Last updated 17 November 2026. The short version: your code stays in your browser, and HeapHop does not track you.">
      <h2 className={h2}>Your code</h2>
      <p className={p}>
        Programs you write or open are run inside your own browser, in a background thread of the page. They are never
        uploaded to HeapHop or to anyone else.
      </p>

      <h2 className={h2}>What is stored on your device</h2>
      <p className={p}>HeapHop keeps two things in your browser&apos;s local storage, on your device only:</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-6 leading-relaxed text-muted-foreground">
        <li>the programs in the Editor, with their names, so your work is still there next time;</li>
        <li>whether you chose the light or the dark theme.</li>
      </ul>
      <p className={p}>
        You can remove both at any time by clearing this site&apos;s data in your browser settings. Deleting a program in
        the Editor removes it straight away.
      </p>

      <h2 className={h2}>What HeapHop does not do</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-6 leading-relaxed text-muted-foreground">
        <li>no accounts, and no personal information is asked for;</li>
        <li>no cookies;</li>
        <li>no analytics, advertising or tracking scripts;</li>
        <li>no requests to other websites: the fonts and everything else are served with the site.</li>
      </ul>

      <h2 className={h2}>Hosting</h2>
      <p className={p}>
        The site is hosted on Vercel. Like any web host, Vercel&apos;s servers receive the basic information every browser
        sends when it loads a page, such as your IP address, your browser type and the page requested, in order to deliver
        the site and keep it secure. HeapHop does not use or look at this information. Vercel&apos;s handling of it is
        described in the <a href="https://vercel.com/legal/privacy-policy" className={link}>Vercel privacy policy</a>.
      </p>

      <h2 className={h2}>Changes</h2>
      <p className={p}>If this policy changes, the new version will be published on this page with a new date.</p>

      <h2 className={h2}>Contact</h2>
      <p className={p}>
        Questions about this policy can be sent to the HeapHop team through the project&apos;s{" "}
        <a href="https://github.com/SAIMKAXI/heaphop" className={link}>GitHub page</a>.
      </p>
    </PageFrame>
  );
}
