# Security policy

HeapHop is used to teach Cyber Security students, so we take reports seriously.

## Reporting a vulnerability

Please report security problems privately, using GitHub's
**[Report a vulnerability](https://github.com/SAIMKAXI/HeapHop/security/advisories/new)**
button on this repository's Security tab. Do not open a public issue with the details.

Please include what you found, the steps to reproduce it, and what an attacker could do with
it. We will reply within 7 days, keep you updated while we fix it, and credit you when the fix
is out if you would like that.

## Scope

- The website [heaphop.vercel.app](https://heaphop.vercel.app): accounts, sign-in, the admin
  page, and anything that could expose another user's data or run code in their browser.
- The way HeapHop runs C++ in the browser: a program that escapes its sandbox, hangs the
  page, or reads data it should not.

Please test only with your own account. Do not access or change other people's data, and do
not run denial-of-service or automated scanning against the site.

Only the live website is supported: fixes are made there, not to old versions.
