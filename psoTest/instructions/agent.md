# Skill: C3 AI Data Chat Agent

Build a natural-language question-answering interface that lets users ask questions about the C3 data model of any application. The pattern combines a C3 `Singleton` service type (Python backend) with a React chat UI (frontend) and routes calls through the standard C3 `c3MemberAction` API.

---

## When to use this skill

Use this skill when:
1. Adding a chat/Q&A page to an existing C3 app
2. The user wants to ask natural-language questions about their data (counts, distributions, trends, summaries)
3. You need to call an LLM (AWS Bedrock, OpenAI, etc.) from a C3 Python action
4. You want a multi-turn conversational interface backed by live C3 entity data

---

## Architecture overview

```
React Chat UI  (AnalysisPage.tsx / ChatPage.tsx)
      │
      │  POST /api/8/<ServiceType>/answerQuestion
      │  payload: [{ }, question, chatHistory]
      ▼
C3 Singleton Service  (<ServiceType>.c3typ + .py)
  ├─ classify intent (keyword rules or small LLM call)
  ├─ fetch C3 data context  (c3.<EntityType>.fetch / fetchCount)
  └─ call LLM (AWS Bedrock via SigV4, or GenaiCore.Llm)
      │
      ▼
  Return markdown string
```

**Key design decisions:**
- The service is a `Singleton` — no per-user state stored server-side; history is passed in by the client on every call.
- Data gathering is done synchronously in the same Python action (no async queues needed for Q&A latency).
- The LLM only sees a compact text summary of query results, not raw C3 objects — this keeps prompt size small and latency low.
- Chat history is capped (e.g. last 5 pairs, answers truncated to 800 chars) before sending to the LLM to avoid token overruns.

---

## Step 1 — Define the C3 service type

Create `src/<AppName>AnalysisService.c3typ`:

```
/**
 * <AppName>AnalysisService provides a natural-language Q&A interface
 * over the <AppName> data model. Uses an LLM to interpret questions,
 * executes structured C3 queries for context, and returns markdown answers.
 */
type <AppName>AnalysisService mixes Singleton {

  /**
   * Answer a natural-language question about the application data.
   *
   * @param question     The user's question.
   * @param chatHistory  Previous Q&A pairs for multi-turn context.
   *                     Each entry is a map with keys "question" and "answer".
   * @returns A markdown-formatted answer string.
   */
  answerQuestion: member function(
    question:    !string,
    chatHistory: [map<string, string>]
  ): string py
}
```

**Rules:**
- Always `mixes Singleton` — the service has no persistent instance state.
- The runtime claim (`py`) must match the runtime that has your LLM client library. For AWS Bedrock via `urllib` only, base `py` works. If you use `pdfminer`/`pdfplumber` add `py-mew3`. If you use `requests`, add a custom runtime.
- Return type is `string` (markdown). Do not return a structured object — it complicates the frontend and forces the LLM to produce schema-conforming JSON.

---

## Step 2 — Implement the Python backend

Create `src/<AppName>AnalysisService.py`. The implementation has four layers:

### 2a. LLM credential + invocation

```python
# ─── LLM configuration ────────────────────────────────────────────────────────

_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"   # fast + cheap; swap for sonnet if needed
# Alternative models:
# "anthropic.claude-3-5-sonnet-20241022-v2:0"  -- higher quality, slower
# "amazon.titan-text-express-v1"               -- AWS-native, no Anthropic pricing

import hashlib, hmac, json, urllib.request, urllib.error
from datetime import datetime, timezone


def _get_bedrock_credentials():
    """
    Retrieve AWS credentials for Bedrock from the C3 GenaiCore config.
    Requires a GenaiCore.Llm.Bedrock.Auth config entry with key "bedrock"
    (or whatever configKey your cluster admin set up).
    """
    auth = c3.GenaiCore.Llm.Bedrock.Auth.forConfigKey("bedrock")
    config = auth.getConfig()
    secret = auth.getSecret()
    return {
        "access_key": config.awsAccessKeyId,
        "secret_key": secret.awsSecretKey,
        "region":     config.awsRegion,
    }


def _sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _get_signature_key(key, date_stamp, region, service):
    k_date    = _sign(("AWS4" + key).encode("utf-8"), date_stamp)
    k_region  = _sign(k_date, region)
    k_service = _sign(k_region, service)
    return _sign(k_service, "aws4_request")


def _bedrock_invoke_with_system(system_prompt, messages, credentials=None):
    """
    Call AWS Bedrock (Anthropic Claude) with a system prompt and a message list.

    messages format:
        [{"role": "user", "content": "..."},
         {"role": "assistant", "content": "..."},
         ...]

    Returns the model's text response as a plain string.
    """
    if credentials is None:
        credentials = _get_bedrock_credentials()

    access_key = credentials["access_key"]
    secret_key = credentials["secret_key"]
    region     = credentials["region"]

    host    = f"bedrock-runtime.{region}.amazonaws.com"
    url     = f"https://{host}/model/{_MODEL_ID}/invoke"
    service = "bedrock"

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": messages,
    })

    now        = datetime.now(timezone.utc)
    amz_date   = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    # SigV4 signing
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical_headers = (
        f"content-type:application/json\n"
        f"host:{host}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers   = "content-type;host;x-amz-date"
    canonical_request = "\n".join([
        "POST", "/model/" + _MODEL_ID + "/invoke", "",
        canonical_headers, signed_headers, body_hash,
    ])
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign   = "\n".join([
        "AWS4-HMAC-SHA256", amz_date, credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signing_key = _get_signature_key(secret_key, date_stamp, region, service)
    signature   = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    auth_header = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    req = urllib.request.Request(
        url,
        data=body.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Amz-Date":   amz_date,
            "Authorization": auth_header,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        response = json.loads(resp.read().decode("utf-8"))
    return response["content"][0]["text"]
```

### 2b. Data gathering functions

Write one function per "data domain" your app exposes. Each function queries C3 and returns a compact plain-text summary (not raw objects).

```python
# ─── Data gathering ────────────────────────────────────────────────────────────

def _get_overview():
    """High-level record counts across key entity types."""
    total   = c3.<PrimaryEntity>.fetchCount({})
    active  = c3.<PrimaryEntity>.fetchCount({"filter": "status == 'active'"})
    # ... add more counts relevant to your app
    return (
        f"Total <PrimaryEntity> records: {total}\n"
        f"Active: {active}\n"
    )


def _get_<domain>_stats():
    """
    Aggregate a specific field / dimension.
    Fetch a page of records, aggregate in Python, return top-N summary.
    """
    result = c3.<EntityType>.fetch({
        "filter": "status == 'completed' && <field> != null",
        "include": "id,<field>",
        "limit": 5000,
    })
    counts = {}
    for obj in (result.objs or []):
        key = (getattr(obj, "<field>", None) or "Unknown").strip()
        counts[key] = counts.get(key, 0) + 1

    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:20]
    lines = [f"  {name}: {cnt}" for name, cnt in top]
    return "<Domain> distribution (top 20):\n" + "\n".join(lines)


# Add more _get_*() functions for each aspect of your data model
# that users might ask about. Keep each function focused and fast
# (prefer fetchCount over fetch where possible).
```

**Guidelines for data gathering functions:**
- Use `fetchCount` for simple counts — it's faster than `fetch` with `limit: 1`.
- Use `fetch` with `limit: 2000–5000` for aggregations you compute in Python. Don't fetch unbounded sets into the LLM context — summarize first.
- Return plain text, not JSON. The LLM reads it more reliably as prose/lists.
- Keep each function's output under ~500 chars. The LLM context window is shared across all intents.

### 2c. Intent classification

```python
# ─── Intent classification ─────────────────────────────────────────────────────

def _classify_question(question):
    """
    Map a natural-language question to a set of data-gathering intents.
    Keyword-based classification is fast, cheap, and deterministic.
    Add intents to match your app's data domains.
    """
    q = question.lower()
    intents = set()

    # Always include a general overview
    intents.add("overview")

    # Domain-specific intents — tune keywords to your data model
    if any(w in q for w in ["distribution", "breakdown", "most", "top", "rank", "common"]):
        intents.add("<domain_a>")
    if any(w in q for w in ["trend", "over time", "by year", "recent", "latest"]):
        intents.add("<domain_b>")
    if any(w in q for w in ["missing", "empty", "incomplete", "coverage", "filled"]):
        intents.add("<domain_c>")
    # ... add more intent/keyword pairs

    return intents


def _build_context(intents):
    """
    Call the data-gathering functions for the detected intents and
    concatenate their output into a single context string.
    """
    parts = []

    if "overview" in intents:
        parts.append(_get_overview())
    if "<domain_a>" in intents:
        parts.append(_get_<domain_a>_stats())
    if "<domain_b>" in intents:
        parts.append(_get_<domain_b>_stats())
    # ...

    return "\n\n".join(parts)
```

### 2d. System prompt and main entrypoint

```python
# ─── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a data analyst assistant for <AppName>.
You answer questions about the application's data using the structured
data context provided in each message.

Guidelines:
- Answer concisely and precisely using only the provided data context.
- Use markdown formatting: headers, bullet lists, tables, bold numbers.
- When asked for counts or percentages, be exact.
- If the data context does not contain enough information to answer,
  say so clearly rather than guessing.
- Do not reference internal field names (like 'sponsoringAgency') —
  use human-readable names ('sponsoring agency').
"""

# ─── Main entrypoint ───────────────────────────────────────────────────────────

def answerQuestion(self, question, chatHistory):
    """
    Answer a natural-language question about the application data.
    Called as a member function on the Singleton instance.
    """
    # 1. Classify intent and gather data context
    intents = _classify_question(question)
    context = _build_context(intents)

    # 2. Build message history (client sends last N pairs, already trimmed)
    messages = []
    for entry in (chatHistory or []):
        q = entry.get("question") if isinstance(entry, dict) else getattr(entry, "question", "")
        a = entry.get("answer")   if isinstance(entry, dict) else getattr(entry, "answer", "")
        if q and a:
            messages.append({"role": "user",      "content": str(q)})
            messages.append({"role": "assistant",  "content": str(a)})

    # 3. Append current question with data context injected
    messages.append({
        "role": "user",
        "content": (
            f"DATA CONTEXT:\n{context}\n\n"
            f"QUESTION: {question}"
        ),
    })

    # 4. Call LLM
    return _bedrock_invoke_with_system(_SYSTEM_PROMPT, messages)
```

---

## Step 3 — Frontend: API layer

Create `src/data/<appName>AnalysisApi.ts`:

```typescript
import { c3MemberAction } from '../c3Action';

export interface ChatHistoryEntry {
  question: string;
  answer: string;
}

/**
 * Call the C3 singleton service to answer a natural-language question.
 */
export const answerQuestion = async (
  question: string,
  chatHistory: ChatHistoryEntry[] = [],
): Promise<string> => {
  // Trim history before sending: last 5 pairs, answers ≤ 800 chars
  const MAX_PAIRS = 5;
  const MAX_ANSWER_LEN = 800;
  const trimmedHistory = chatHistory
    .slice(-MAX_PAIRS)
    .map((e) => ({ question: e.question, answer: e.answer.slice(0, MAX_ANSWER_LEN) }));

  const result = await c3MemberAction(
    '<AppName>AnalysisService', // C3 type name
    'answerQuestion',            // action name
    {},                          // empty object = singleton (no instance id)
    [question, trimmedHistory],  // positional args
  );

  if (typeof result === 'string') return result;
  if (result?.val && typeof result.val === 'string') return result.val;
  return JSON.stringify(result ?? 'No response received.');
};
```

**Why `c3MemberAction` with `{}`?**
The Singleton mixin means there is exactly one instance. `c3MemberAction` sends the payload as `[instance, ...args]`. Using `{}` for the instance tells C3 to resolve the singleton automatically.

---

## Step 4 — Frontend: Chat page component

Create `src/components/<Name>/<Name>Page.tsx`. The minimal structure:

```tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { answerQuestion, type ChatHistoryEntry } from '../../data/<appName>AnalysisApi';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  // 4–6 questions that showcase what your data model can answer
  "How many records are there in total?",
  "What is the distribution of <key field>?",
  "Which <entity> has the most <metric>?",
  "What percentage of records have <field> filled?",
];

export default function <Name>Page() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildChatHistory = useCallback((msgs: Message[]): ChatHistoryEntry[] => {
    const pairs: ChatHistoryEntry[] = [];
    for (let i = 0; i + 1 < msgs.length; i += 2) {
      const u = msgs[i], a = msgs[i + 1];
      if (u?.role === 'user' && a?.role === 'assistant' && !a.isStreaming && a.content) {
        pairs.push({ question: u.content, answer: a.content });
      }
    }
    return pairs.slice(-5);
  }, []);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;
    setError(null);

    const history = buildChatHistory(messages);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question };
    const placeholder: Message = { id: Date.now() + '-a', role: 'assistant', content: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, placeholder]);
    setInput('');
    setIsLoading(true);

    try {
      const answer = await answerQuestion(question, history);
      setMessages(prev => prev.map(m =>
        m.id === placeholder.id ? { ...m, content: answer, isStreaming: false } : m
      ));
    } catch (e) {
      const errMsg = typeof e === 'string' ? e : 'Something went wrong. Please try again.';
      setError(errMsg);
      setMessages(prev => prev.filter(m => m.id !== placeholder.id));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, buildChatHistory]);

  return (
    <div className="h-full flex flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto mt-8">
            {SUGGESTED_QUESTIONS.map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                className="text-left p-3 rounded-lg border border-border hover:bg-secondary text-sm">
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl rounded-lg p-3 ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-secondary'}`}>
              {msg.isStreaming ? (
                <span className="animate-pulse">Thinking…</span>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && <div className="mx-4 mb-2 p-2 rounded bg-red-500/10 text-red-400 text-sm">{error}</div>}

      {/* Input area */}
      <div className="p-4 border-t border-border flex gap-2">
        <textarea
          className="flex-1 resize-none rounded-lg border border-border bg-secondary p-2 text-sm"
          rows={2}
          placeholder="Ask a question about your data…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
        />
        <button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}
```

---

## Step 5 — Wire up routing and navigation

In `App.tsx`, add the lazy import and route:

```tsx
const <Name>Page = lazy(() => import('./components/<Name>/<Name>Page'));
// ...
<Route path="/<name>" element={<Suspense fallback={<div>Loading…</div>}><Name>Page /></Suspense>} />
```

In `navigation.ts`, add a nav item:
```ts
{
  id: '<name>',
  path: '/<name>',
  icon: faComments,       // or any appropriate FA icon
  iconActive: faComments,
  label: 'Chat',
  tooltip: 'Ask questions about your data',
},
```

---

## Step 6 — Configuration prerequisites

The backend requires a configured AWS Bedrock auth entry:

```javascript
// Run in C3 console to verify Bedrock config exists
GenaiCore.Llm.Bedrock.Auth.forConfigKey("bedrock").getConfig();
```

If it throws, your cluster admin needs to set up a `GenaiCore.Llm.Bedrock.Auth` config entry. The key `"bedrock"` can be anything — just match it in the Python code.

**No other dependencies are required.** The SigV4 signing is implemented with stdlib `hashlib`/`hmac`/`urllib` — no third-party HTTP library needed.

---

## Customization guide

### Adding a new data domain

1. Write a `_get_<domain>()` function that queries C3 and returns a text summary.
2. Add a keyword rule in `_classify_question()` that adds `"<domain>"` to the intent set.
3. Call `_get_<domain>()` in `_build_context()` when `"<domain>"` is in intents.
4. Add a suggested question to `SUGGESTED_QUESTIONS` in the frontend.

### Switching LLM providers

Replace `_bedrock_invoke_with_system` with a function for your provider. The rest of the code (classification, context building, history assembly) is provider-agnostic.

**OpenAI / Azure OpenAI:**
```python
def _openai_invoke(system_prompt, messages):
    import urllib.request, json
    api_key = c3.YourConfig.inst().openaiApiKey  # or however you store keys
    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "max_tokens": 2048,
    })
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body.encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["choices"][0]["message"]["content"]
```

**Using C3 GenaiCore.Llm directly (if your platform version supports it):**
```python
def _c3_llm_invoke(system_prompt, messages):
    llm = c3.GenaiCore.Llm.forConfigKey("default")
    full_messages = [{"role": "system", "content": system_prompt}] + messages
    return llm.chat({"messages": full_messages}).content
```

### Improving intent classification with LLM routing

For more complex apps with many domains, replace keyword classification with a fast LLM call:

```python
def _classify_question_llm(question, all_intents):
    """Use a cheap LLM call to classify intent more accurately."""
    intent_list = "\n".join(f"- {i}" for i in all_intents)
    prompt = f"""Given this question, which of the following data domains are relevant?
Return a JSON array of domain names.

Domains:
{intent_list}

Question: {question}

Return only a JSON array, e.g.: ["overview", "agency_stats"]"""
    
    response = _bedrock_invoke_with_system(
        "You are a routing assistant. Return only JSON.",
        [{"role": "user", "content": prompt}]
    )
    try:
        return set(json.loads(response))
    except Exception:
        return {"overview"}
```

### Handling large data sets

If your entity counts are in the millions, avoid `fetch` with large `limit` values:

```python
# Instead of fetching records and aggregating in Python:
# BAD for large datasets:
#   result = c3.MyEntity.fetch({"limit": 100000, "include": "id,category"})
#   counts = Counter(obj.category for obj in result.objs)

# GOOD: use fetchCount with specific filters
categories = ["A", "B", "C", "D"]
counts = {cat: c3.MyEntity.fetchCount({"filter": f"category == '{cat}'"}) for cat in categories}
```

Or use C3 metrics/calc fields to pre-aggregate data rather than computing it at query time.

---

## Common pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `No response received.` in UI | `c3MemberAction` returned an object, not a string | Check the `if typeof result === 'string'` unwrap logic in the API layer |
| LLM returns generic non-answers | Context too vague or missing | Add more specific data-gathering functions; narrow the context to what the LLM actually needs |
| Slow responses (>10s) | Too many `fetch` calls or large limit | Reduce limit, replace with `fetchCount`, or cache stats with `Cached` mixin |
| Token limit errors from LLM | Chat history too long | Trim history more aggressively; truncate answers at 400–600 chars instead of 800 |
| `GenaiCore.Llm.Bedrock.Auth` not found | Bedrock not configured on cluster | Ask cluster admin to add a Bedrock auth config; fall back to a direct API key if needed |
| Singleton not resolving | Wrong instance arg in `c3MemberAction` | Pass `{}` (empty object), not `null` or `undefined` |

---

## Reference: Real-world implementation

This skill is derived from the `AnalysisService` in the `afrlDev` package. Key files for reference:

- `afrlDev/src/AnalysisService.c3typ` — type definition
- `afrlDev/src/AnalysisService.py` — full Python implementation with SigV4 signing
- `afrlDev/ui/react/src/components/Analysis/AnalysisPage.tsx` — full React chat UI
- `afrlDev/ui/react/src/data/analysisApi.ts` — API layer

The `afrlDev` implementation queries `ReportDocPage` (SF 298 form data), `ExtractionResult` (LLM-extracted entities), and `DticTechnicalReport` (document metadata) — but the pattern is identical for any C3 data model.
 