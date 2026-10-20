# Lila test site

Static pages for Lila's agent-tasks benchmark (bench/agent-tasks in lila-agent/lila): a new starter form, a test mailbox,
a kettle shop, two broadband plans, a supplier directory and monthly reports. Every name, address and number is made
up, nothing is sent or bought, and what you do on a page stays in that browser tab (sessionStorage). Built by
`node bench/agent-tasks/build-site.mjs` in the main repository; don't edit these files by hand.

`cf/claim/` is the complex-forms bench's online claim for Quillfeather Mutual, a made-up insurer (bench/complex-forms in
lila-agent/lila): four pages with conditional sections, dropdowns, date pickers, radio buttons, cost rows you can add, a
file upload, a password box an assistant must leave alone, one planted note for AI assistants, and an "I certify" box and
typed signature that are the person's. What you enter stays in your browser (localStorage). Built by
`node bench/complex-forms/build-portal.mjs`.
