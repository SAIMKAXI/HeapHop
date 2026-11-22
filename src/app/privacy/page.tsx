import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageFrame } from "@/ui/site/page-frame";

export const metadata: Metadata = { title: "Privacy policy", description: "What HeapHop stores about you, where, who can see it, and how to have it deleted." };

const h2 = "mt-10 text-xl font-bold first:mt-0";
const p = "mt-3 leading-relaxed text-muted-foreground";
const ul = "mt-3 list-disc space-y-1.5 pl-6 leading-relaxed text-muted-foreground";
const link = "font-semibold text-accent underline-offset-4 hover:underline";
const strong = "font-semibold text-foreground";

const Row = ({ what, why, children }: { what: string; why: string; children?: ReactNode }) => (
  <tr className="border-t border-card-border align-top">
    <td className="py-2.5 pr-4 font-semibold text-foreground">{what}</td>
    <td className="py-2.5 text-muted-foreground">{why}{children}</td>
  </tr>
);

// Keep this page true: every claim here is checked against the code, the migrations in
// supabase/migrations and the hosting setup. Change the date when anything changes.
export default function PrivacyPage() {
  return (
    <PageFrame
      current="privacy"
      title="Privacy policy"
      intro="Last updated 22 November 2026. The short version: HeapHop keeps only what an account needs, your code never leaves your browser, and there is no tracking or advertising."
    >
      <h2 className={h2}>Who runs HeapHop</h2>
      <p className={p}>
        HeapHop is a student project, built and run by the HeapHop team (see the About page). In this policy
        &ldquo;we&rdquo; means that team.
      </p>

      <h2 className={h2}>Your code</h2>
      <p className={p}>
        Programs you write in the Editor or open in Learn run inside your own browser, in a background thread of the page.
        They are <span className={strong}>never uploaded</span> to HeapHop or to anyone else, and we cannot see them.
      </p>

      <h2 className={h2}>What your account stores</h2>
      <p className={p}>An account is needed to use Learn and the Editor. When you sign up we store:</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wider text-muted"><th className="pb-2 pr-4">What</th><th className="pb-2">Why</th></tr></thead>
          <tbody>
            <Row what="Full name" why="Shown to the HeapHop admins in the account list. It is never shown to other students." />
            <Row what="Email address" why="To sign you in, to confirm the address, and to send a password-reset link when you ask for one." />
            <Row what="University or college" why="To count how many students use HeapHop at each university. Spellings of a listed university are saved as its listed name." />
            <Row what="Password" why="To sign you in. It is stored only as a one-way hash by our sign-in provider; nobody, including us, can read it." />
            <Row what="Authenticator app secret" why="Only if you turn on two-step sign-in (optional), so the codes from your app can be checked. Removed when you turn it off." />
            <Row what="Account details" why="Sign-up date, last sign-in time, whether the email is confirmed, your role (student or admin) and whether the account is disabled." />
          </tbody>
        </table>
      </div>
      <p className={p}>
        You can change your name, university and password at any time in Account settings. We do not ask for anything else,
        and we do not record which lessons you open or what you do on the site.
      </p>

      <h2 className={h2}>Security records</h2>
      <ul className={ul}>
        <li>
          To slow down password guessing, the site counts sign-up, sign-in and password-reset attempts per IP address and
          per email address. The counts are stored under a one-way, keyed code instead of the address itself, and are
          deleted within a day.
        </li>
        <li>
          Our sign-in provider, Supabase, keeps short-lived logs of sign-in events and requests, which include IP
          addresses, to keep the service secure.
        </li>
        <li>Our own error logs record only an error code, never your name, email, password or code.</li>
      </ul>

      <h2 className={h2}>Cookies and your browser</h2>
      <p className={p}>HeapHop uses cookies only to keep you signed in. There are no advertising, analytics or tracking cookies.</p>
      <ul className={ul}>
        <li>
          <span className={strong}>Sign-in cookies</span> (named <code className="font-mono text-xs">sb-…-auth-token</code>) hold your
          session while you are signed in and are removed when you log out. They cannot be read by the page&apos;s scripts.
        </li>
        <li>
          <span className={strong}>A password-reset cookie</span> lasts at most 30 minutes, only while you reset your password.
        </li>
      </ul>
      <p className={p}>The site also keeps a few settings in your browser&apos;s local storage, on your device only:</p>
      <ul className={ul}>
        <li>the programs in the Editor, with their names, so your work is still there next time;</li>
        <li>whether you chose the light or the dark theme;</li>
        <li>whether you switched Byte, the robot helper, on or off;</li>
        <li>how wide you made the code and stack panels in the visualizer.</li>
      </ul>
      <p className={p}>You can remove them by clearing this site&apos;s data in your browser. Deleting a program in the Editor removes it straight away.</p>

      <h2 className={h2}>Who can see your information</h2>
      <ul className={ul}>
        <li>
          <span className={strong}>You</span>, in Account settings.
        </li>
        <li>
          <span className={strong}>The HeapHop admins</span> (members of the team) see the account list: name, email,
          university, role, sign-up date and whether the account is disabled, plus totals per university. They can disable an
          account. They cannot see passwords, authenticator secrets or your code.
        </li>
        <li>
          <span className={strong}>Other students</span> cannot see anything about you.
        </li>
      </ul>
      <p className={p}>We do not sell, rent or share your information, and we do not use it for advertising.</p>

      <h2 className={h2}>Services we use</h2>
      <ul className={ul}>
        <li>
          <span className={strong}>Supabase</span> stores the accounts and handles sign-in, in its Mumbai, India data
          centre, and sends the confirmation and password-reset emails. See the{" "}
          <a href="https://supabase.com/privacy" className={link}>Supabase privacy policy</a>.
        </li>
        <li>
          <span className={strong}>Vercel</span> hosts the website. Like any web host, its servers receive the basic
          information every browser sends, such as your IP address, browser type and the page requested, to deliver the
          site and keep it secure. See the <a href="https://vercel.com/legal/privacy-policy" className={link}>Vercel privacy policy</a>.
        </li>
      </ul>
      <p className={p}>
        Nothing else: no analytics, advertising or tracking scripts, and no requests to other websites. The fonts and
        everything else are served with the site.
      </p>

      <h2 className={h2}>How long we keep it</h2>
      <p className={p}>
        Your account information is kept for as long as you have an account. Rate-limit counts are deleted within a day.
        When an account is deleted, its profile and sign-in data are removed for good.
      </p>

      <h2 className={h2}>Deleting your account</h2>
      <p className={p}>
        To have your account and everything stored with it deleted, open an issue on the project&apos;s{" "}
        <a href="https://github.com/SAIMKAXI/HeapHop/issues" className={link}>GitHub page</a> asking for deletion.
        Issues there are public, so <span className={strong}>do not write your email address, password or any other personal
        details in it</span>. We will reply in the issue and may ask you to confirm the request from the email address on the
        account before we delete it.
      </p>

      <h2 className={h2}>Changes</h2>
      <p className={p}>If this policy changes, the new version will be published on this page with a new date.</p>

      <h2 className={h2}>Contact</h2>
      <p className={p}>
        Questions about this policy can be sent to the HeapHop team through the project&apos;s{" "}
        <a href="https://github.com/SAIMKAXI/HeapHop" className={link}>GitHub page</a>. Please don&apos;t post personal
        details there.
      </p>
    </PageFrame>
  );
}
