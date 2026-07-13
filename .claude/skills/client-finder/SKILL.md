---
name: client-finder
description: Use when the user wants to find qualified sales leads/prospects and produce a CSV plus personalized cold-outreach emails for a short-form Product Motion Video offering. Triggers on requests like "find me leads", "build a prospect list", "generate outreach emails for these companies". Sources only publicly available information and never invents missing data.
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

## The Service (read before writing any email)

Jakob writes and builds **short-form Product Motion Videos (10–20 seconds)**, built from existing product photos or product images the client supplies. This is the entire offer — nothing else.

**Never claim, imply, or invent any of the following:**
- An on-site shoot, filming, or visiting the company — do not imply a shoot is required unless the recipient explicitly asks for one.
- Interviewing staff/founders on camera, capturing "real footage," time-lapses of physical processes, documentary-style pieces, factory-floor filming.
- Prior work made *for* similar brands or *in* their specific industry — the portfolio is a generic reel that demonstrates general quality/style only, never framed as "similar work I made for X."

## Email Personalization

Generate one unique email per qualified lead. Write as an elite B2B cold email writer specializing in Product Motion Videos — the only goal is to earn a reply, and every email must feel handcrafted after actually researching the company.

**Research first** (website, about page, founder story, product pages, best sellers, new launches, materials, manufacturing, sustainability, reviews, social media) and mention one highly specific observation that could not be reused for another company.

Rules:
- 120–170 words.
- Follow the `humanize-writing` skill for tone — natural English, no buzzwords, no statistics, no AI mentions, no generic compliments, no fake promises, no clichéd transitions/closers, no "I hope this email finds you well," no bullet-point lists, no negation structures ("not just X, it's Y"), no em-dash-heavy phrasing. Never sound like a template — vary sentence structure and word choice between emails.
- Introduce the offer using wording similar to: "I create short form product motion videos for ecommerce brands."
- Contain exactly one motion video idea, unique and tailored to that company, built from existing product photos/images — never framed as needing a shoot or site visit.
- Mention one product or collection when possible.
- Include the portfolio reference exactly once, phrased like "Here's my portfolio: portfolio" — the word "portfolio" (never the raw URL) must be a hyperlink to https://teammateapp.site/, written as an HTML anchor tag: `<a href="https://teammateapp.site/">portfolio</a>`. Never spell out the URL in visible text.
- End with one simple question CTA, e.g. "Would this be worth exploring?", "Does this sound interesting?", "Would love to hear your thoughts."
- Sign off with the sender's details:
  ```
  Jakob Rösler
  Albert-Einstein-Straße 47
  02977 Hoyerswerda
  Germany
  ```

### Quality check before returning any email
- Company research is specific — this line couldn't be pasted into an email for a different company.
- Exactly one unique motion video concept, built from existing assets (never a shoot).
- Human sounding, not a template.
- 120–170 words.
- Portfolio linked correctly, word "portfolio" only.
- No AI mention, no buzzwords, no statistics, no generic sales language.

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
- No shoot/filming/visit claims — motion video only, built from existing assets
- Email 120–170 words
- CSV complete
