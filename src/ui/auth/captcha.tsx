"use client";
import { useEffect, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

/**
 * The hCaptcha "I am human" check for the sign-up, login and password-reset forms. It renders
 * only when a site key is configured (so local development and the tests, which have none, are
 * unchanged), and writes the token into a hidden `captchaToken` field the server action reads.
 *
 * hCaptcha tokens are single use, so the widget is reset whenever `resetSignal` changes — pass the
 * form action's result there, and a fresh token is ready for the next attempt after a failure.
 */
export function Captcha({ siteKey, resetSignal }: { siteKey?: string; resetSignal?: unknown }) {
  const ref = useRef<HCaptcha>(null);
  const [token, setToken] = useState("");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setToken("");
    ref.current?.resetCaptcha();
  }, [resetSignal]);

  if (!siteKey) return null;
  return (
    <div className="mb-4">
      <input type="hidden" name="captchaToken" value={token} />
      <HCaptcha
        ref={ref}
        sitekey={siteKey}
        onVerify={(t) => setToken(t)}
        onExpire={() => setToken("")}
        onError={() => setToken("")}
      />
    </div>
  );
}
