---
name: client-finder
description: Use when the user wants to find qualified sales leads/prospects and produce a CSV plus personalized cold-outreach emails for a motion-video / content offering. Triggers on requests like "find me leads", "build a prospect list", "generate outreach emails for these companies". Sources only publicly available information and never invents missing data.
---

# Client Finder — High-Volume Lead Pipeline

## Daily Target
- Target 300–500 qualified leads per day.
- Work in batches of 50–100 leads.
- Validate each batch before continuing.
- Maintain quality while supporting high throughput.

## CSV Export

Generate a CSV with these columns:

```
company,website,industry,source,product,contact_name,contact_role,public_contact,lead_score,motion_opportunity,personalization_note,email_subject,email_body,next_action
```

Rules:
- Use only publicly available information.
- Never invent missing values — leave a field blank rather than guessing.
- `lead_score` is always a number from 1-100 (never 1-10 or any other scale).
- In Mode B/C/D, `email_subject` and `email_body` must never be left blank — every qualified lead gets a complete personalized email following the Email Personalization rules below.

## Email Personalization

Generate one unique email per qualified lead.

Rules:
- 80–150 words.
- Follow the `humanize-writing` skill for tone — no AI-style phrasing, no clichéd transitions/closers, no "I hope this email finds you well," no bullet-point lists, no negation structures ("not just X, it's Y"), no em-dash-heavy phrasing, no generic templated openers. Vary sentence structure and word choice between emails.
- Mention one genuine public observation about the company.
- Mention one product or collection when possible.
- Explain one realistic motion-video opportunity.
- Include a portfolio reference: the word "portfolio" (never the raw URL) must appear as a hyperlink to https://teammateapp.site/, written as an HTML anchor tag: `<a href="https://teammateapp.site/">portfolio</a>`. Never spell out the URL in visible text — the link text is always the word "portfolio" itself. This must appear in every email, exactly once.
- Short call to action.
- Avoid generic wording and unsupported claims.
- Sign off with the sender's details:
  ```
  Jakob Rösler
  Albert-Einstein-Straße 47
  02977 Hoyerswerda
  Germany
  ```

## Contact Priority

Always attempt to identify the CEO / Founder / Managing Director (Geschäftsführer) first — they are the preferred contact for every lead. Fall back to the rest of this order only when the CEO/Founder genuinely cannot be identified publicly:
1. CEO / Founder / Managing Director
2. Marketing
3. Brand
4. Ecommerce
5. Growth
6. Official company contact

Avoid support/customer-service contacts whenever a more relevant business contact exists.

Always research and fill in a real named contact_name/contact_role where one is publicly discoverable (company team/about pages, press coverage, LinkedIn, press releases) before falling back to a general company contact. Only leave contact_name blank if, after an actual search, no publicly identifiable person can be verified — never invent a name.

## Output Modes

- **Mode A**: CSV only
- **Mode B**: CSV + Emails
- **Mode C**: CSV + Emails + Research
- **Mode D**: Expanded research for highest-priority leads

Ask the user which mode they want if it isn't specified.

## Final Checklist

Before delivering results, confirm:
- Website active
- Physical products confirmed
- Public contact selected
- Personalization based on public information
- Email concise
- CSV complete
