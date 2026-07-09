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
- Natural human tone — write like a real agency owner reaching out personally, not like an AI. No AI-style writing: no "I hope this email finds you well," no bullet-point lists, no overly polished marketing copy, no em-dash-heavy phrasing, no generic templated openers. Vary sentence structure and word choice between emails.
- Mention one genuine public observation about the company.
- Mention one product or collection when possible.
- Explain one realistic motion-video opportunity.
- Include a portfolio reference: work the word "portfolio" naturally into the email body as a link to https://teammateapp.site/ (e.g. "you can check out my portfolio here: https://teammateapp.site/" or similar phrasing) so the recipient can see the quality of work produced. This must appear in every email.
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

Prefer publicly identifiable contacts in this order:
1. Marketing
2. Brand
3. Ecommerce
4. Growth
5. Founder
6. CEO (small companies)
7. Official company contact

Avoid support contacts whenever a more relevant public business contact exists.

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
