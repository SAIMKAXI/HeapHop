import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageFrame } from "@/ui/site/page-frame";
import { PageScene } from "@/ui/three/page-scene";

export const metadata: Metadata = { title: "Privacy policy", description: "What HeapHop stores about you, who can see it, and how to have it deleted." };

const link = "font-semibold text-accent underline-offset-4 hover:underline";
const REPO = "https://github.com/SAIMKAXI/HeapHop";
// Both links open GitHub's "new issue" form; the deletion one has its title filled in.
const DELETE_ISSUE = `${REPO}/issues/new?title=${encodeURIComponent("Please delete my HeapHop account")}&body=${encodeURIComponent("Please delete my HeapHop account.\n\n(Do not write your email address, password or any other personal details here. We will ask you to confirm from the email address on the account.)")}`;
const NEW_ISSUE = `${REPO}/issues/new`;

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-5 break-inside-avoid rounded-2xl border-2 border-card-border bg-card p-6" data-privacy-section>
    <h2 className="text-lg font-bold">{title}</h2>
    <div className="mt-2 space-y-2 leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

// Keep this page true and short: every claim is checked against the code, the migrations in
// supabase/migrations and the hosting setup. Change the date when anything changes.
export default function PrivacyPage() {
  return (
    <PageFrame
      current="privacy"
      title="Privacy policy"
      intro="Last updated 22 November 2026. HeapHop keeps only what an account needs. Your code never leaves your browser, and there is no tracking or advertising."
      scene={<PageScene name="privacy" />}
    >
      <div data-reveal-children className="gap-5 md:columns-2">
        <Section title="Your code">
          <p>Programs you write or open run inside your own browser. They are never uploaded, and we cannot see them.</p>
        </Section>
        <Section title="What we store">
          <p>
            Your name, email address and university, and your password stored only as a one-way hash that nobody can read.
            If you turn on two-step sign-in, the secret for your authenticator app is stored too.
          </p>
          <p>We use this only to sign you in and to count how many students use HeapHop at each university.</p>
        </Section>
        <Section title="Who can see it">
          <p>
            You, in Account settings, and the HeapHop admins, who can see your name, email and university. Nobody can see
            your password. We never sell or share your information.
          </p>
        </Section>
        <Section title="Cookies">
          <p>
            Only to keep you signed in. There are no advertising or tracking cookies. Your Editor programs and settings
            stay in your browser on your device.
          </p>
        </Section>
        <Section title="Services we use">
          <p>
            <a href="https://supabase.com/privacy" className={link}>Supabase</a> stores accounts (in Mumbai, India) and
            sends sign-up and password-reset emails. <a href="https://vercel.com/legal/privacy-policy" className={link}>Vercel</a>{" "}
            hosts the website.
          </p>
        </Section>
        <Section title="Deleting your account">
          <p>
            <a href={DELETE_ISSUE} className={link} data-delete-request>Ask for deletion on GitHub</a>. Issues there are
            public, so do not write your email address or any personal details. We may ask you to confirm from the account&apos;s
            email address, then delete your account and everything stored with it.
          </p>
        </Section>
        <Section title="Changes and contact">
          <p>
            Changes are published on this page with a new date. Questions can be sent by{" "}
            <a href={NEW_ISSUE} className={link} data-contact>opening an issue on GitHub</a>.
          </p>
        </Section>
      </div>
    </PageFrame>
  );
}
