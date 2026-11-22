-- Data stays data (task 8.14). Two more CHECKs, so the database itself refuses markup in every
-- text people or admins can store, whatever path the data takes:
--   - university short forms get the same rule as names;
--   - email addresses refuse < > " ' ` \, spaces and control characters (no real address the
--     site accepts needs them; the site refuses them too).
-- Existing rows were checked first: none break these rules.

alter table public.universities add constraint aliases_chars check (array_to_string(aliases, ' ') !~ '[<>{}\\[\]`$\x00-\x1f\x7f]' and char_length(array_to_string(aliases, '')) <= 600);

alter table public.profiles drop constraint email_ok;
alter table public.profiles add constraint email_ok check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email !~ '[<>"''`\\\x00-\x20\x7f]');
