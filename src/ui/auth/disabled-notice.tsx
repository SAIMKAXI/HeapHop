// What a student sees when their account has been disabled: a clear, polite explanation and a
// way to ask for a review. The request opens a pre-written GitHub issue that carries only the
// account's reference code (see src/server/reference.ts), because GitHub issues are public.
import { ExternalLink, ShieldAlert } from "lucide-react";

export function DisabledNotice({ reference, reviewUrl }: { reference: string | null; reviewUrl: string }) {
  return (
    <div role="alert" data-disabled-notice className="mb-4 rounded-xl border-2 border-danger/40 bg-danger-dim p-4 text-sm">
      <p className="flex items-center gap-2 font-bold text-danger"><ShieldAlert size={16} aria-hidden /> Your account has been disabled</p>
      <p className="mt-2 leading-relaxed text-foreground/90">
        An administrator has disabled this HeapHop account, so you can&apos;t sign in at the moment. If you believe this is a
        mistake, you can ask us to review it.
      </p>
      <a href={reviewUrl} target="_blank" rel="noopener noreferrer" data-review-request
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-danger/50 px-3.5 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-background">
        Request a review on GitHub <ExternalLink size={13} aria-hidden />
      </a>
      {reference && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Your reference code is <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-foreground" data-reference>{reference}</code>.
          It&apos;s already in the request, so we can find your account. GitHub issues are public: please don&apos;t add your email
          address or password.
        </p>
      )}
    </div>
  );
}
