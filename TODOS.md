# TODOs

## Add token-based cost guard

**What:** Implement a cost guard that tracks estimated input + output tokens per conversation (or per day) and blocks further API calls when a token budget is exceeded.

**Why:** The current rate limiter only counts requests (10 req / 60s), but the real cost driver is tokens. A single 2,048-token response costs far more than ten 50-token responses.

**Pros:** Prevents runaway API bills from long replies or large conversation histories.
**Cons:** Requires estimating token counts (e.g., via `@anthropic-ai/tokenizer` or a rough character heuristic), adding complexity.

**Context:** This was identified during the /plan-eng-review outside voice as a critical gap in the current cost-control strategy. The request rate limiter should remain as a first line of defense, but token budgeting is the more precise guard.

**Depends on / blocked by:** Anthropic API adapter must be stable and returning token usage metadata (or we must implement client-side token estimation).

---

## Define DLP policy for message history sent to Anthropic

**What:** Document and optionally implement a data-loss prevention strategy for message history forwarded to the Anthropic API. For example: strip URLs, redact email addresses / phone numbers / ID numbers, or limit the number of historical messages exposed.

**Why:** Forwarding entire conversation histories to a third-party API introduces PII and confidential data leakage risks. A system prompt alone cannot prevent users from pasting sensitive information into the chat.

**Pros:** Reduces compliance risk and builds trust with security stakeholders.
**Cons:** Requires defining what "sensitive" means for this organization, which may need legal/compliance input.

**Context:** Flagged in the /plan-eng-review outside voice as a gap in the security architecture. The current plan only addresses message logging, not the data actually sent to the AI backend.

**Depends on / blocked by:** Needs alignment with the company's data classification and compliance requirements.
