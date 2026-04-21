# Skill: C3 AI Chat Agent — Overlay Sidebar with Tabs

Build a natural-language chat agent that opens as a **resizable overlay sidebar** from a top-bar icon. The UI supports **browser-style tabs** for parallel conversations, a **chat history** list, **typewriter streaming**, and **markdown rendering** — all backed by a C3 Singleton service that calls an LLM.

---

## When to use this skill

1. Adding a chat / Q&A agent to an existing C3 app
2. The user wants to ask natural-language questions about their data
3. You need to call an LLM (AWS Bedrock, OpenAI, etc.) from a C3 Python action
4. You want a multi-turn conversational interface backed by live C3 entity data

---

## Features

| Feature | Description |
|---------|-------------|
| **Top-bar trigger** | A chat icon in the app's top bar toggles the sidebar; highlights when open |
| **Overlay panel** | `fixed` position, floats over the page without squeezing the main content; has a `shadow-xl` to visually separate |
| **Resizable** | Left edge is a drag handle; drag to resize between 340px and 800px |
| **Browser-style tabs** | Each conversation opens as a tab; click between tabs, close with X; active tab has accent bottom border |
| **Parallel queries** | Each tab is a fully isolated React component (`key={conversationId}`), so multiple tabs can fetch answers simultaneously without interfering |
| **Chat history** | Clock icon toggles a history list showing all past conversations with message counts and dates; clicking one opens it as a tab |
| **Typewriter animation** | Responses stream character-by-character via `requestAnimationFrame`; skip button to jump to end |
| **Markdown rendering** | Responses render markdown (tables, bold, lists, code) via `react-markdown` + `remark-gfm` |
| **Suggested questions** | Empty conversations show clickable starter questions |
| **Multi-turn context** | Client sends the last 5 Q&A pairs (answers truncated to 800 chars) with each request |
| **Overflow-safe** | Uses `scrollTop` on the message container (not `scrollIntoView`) to prevent page-level scroll; `overflow: hidden` on `html`/`body` |

---

## Architecture

```
TopBar  ──(click chat icon)──▶  ChatSidebar (fixed overlay, right edge)
                                  │
                                  ├── Header: [+] [history] [X]
                                  ├── Tab bar: tab per conversation
                                  └── ChatTab (keyed by conversationId)
                                        │
                                        │  POST /api/8/<ServiceType>/answerQuestion
                                        │  payload: [{ }, question, chatHistory]
                                        ▼
                                  C3 Singleton Service (.c3typ + .py)
                                    ├─ classify intent
                                    ├─ fetch C3 data context
                                    └─ call LLM → return markdown string
```

### Key design decisions

- The sidebar is **not** a route — it overlays any page. No navigation change when opening chat.
- Each `ChatTab` component is keyed by conversation ID, so React creates a **fresh component instance** per conversation with its own `isFetching`, `rafRef`, `stopRef`, and message state.
- The `ChatContext` React context manages: sidebar visibility, conversation list, active conversation, open tabs array.
- The C3 service is a `Singleton` — no per-user state stored server-side; chat history is passed in by the client on every call.
- The LLM only sees a compact text summary of query results, not raw C3 objects.

---

## File structure

```
src/
  <AppName>AnalysisService.c3typ     # C3 Singleton service type
  <AppName>AnalysisService.py        # Python backend (LLM + data gathering)

ui/react/src/
  contexts/
    ChatContext.tsx                   # Sidebar state, conversations, tabs
  components/Chat/
    ChatSidebar.tsx                   # Overlay panel, tab bar, history list
    ChatTab.tsx                       # Per-conversation chat (isolated state)
  data/
    <appName>AnalysisApi.ts           # API layer calling C3 backend
  components/TopBar/
    TopBar.tsx                        # (modified) Add chat toggle icon
  App.tsx                            # (modified) Wrap with ChatProvider, add <ChatSidebar />
  globals.css                        # (modified) overflow: hidden on html/body
```

---

## Step 1 — C3 service type

Create `src/<AppName>AnalysisService.c3typ`:

```
type <AppName>AnalysisService mixes Singleton {

  answerQuestion: member function(
    question:    !string,
    chatHistory: [map<string, string>]
  ): string py
}
```

**Rules:**
- Always `mixes Singleton` — the service has no persistent instance state.
- Runtime claim (`py`) must match the runtime with your LLM client library. For AWS Bedrock via `urllib`, base `py` works.
- Return type is `string` (markdown). Do not return structured objects.

---

## Step 2 — Python backend

Create `src/<AppName>AnalysisService.py`. Four layers:

### 2a. LLM invocation

```python
_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

import hashlib, hmac, json, urllib.request
from datetime import datetime, timezone

def _get_bedrock_credentials():
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
    if credentials is None:
        credentials = _get_bedrock_credentials()
    access_key = credentials["access_key"]
    secret_key = credentials["secret_key"]
    region     = credentials["region"]
    host    = f"bedrock-runtime.{region}.amazonaws.com"
    url     = f"https://{host}/model/{_MODEL_ID}/invoke"
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": messages,
    })
    now        = datetime.now(timezone.utc)
    amz_date   = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical_headers = f"content-type:application/json\nhost:{host}\nx-amz-date:{amz_date}\n"
    signed_headers   = "content-type;host;x-amz-date"
    canonical_request = "\n".join([
        "POST", "/model/" + _MODEL_ID + "/invoke", "",
        canonical_headers, signed_headers, body_hash,
    ])
    credential_scope = f"{date_stamp}/{region}/bedrock/aws4_request"
    string_to_sign   = "\n".join([
        "AWS4-HMAC-SHA256", amz_date, credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signing_key = _get_signature_key(secret_key, date_stamp, region, "bedrock")
    signature   = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    auth_header = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    req = urllib.request.Request(
        url, data=body.encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Amz-Date": amz_date, "Authorization": auth_header},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))["content"][0]["text"]
```

### 2b. Data gathering

Write one function per data domain. Each queries C3 and returns a compact plain-text summary.

```python
def _get_overview():
    total  = c3.<PrimaryEntity>.fetchCount({})
    active = c3.<PrimaryEntity>.fetchCount({"filter": "status == 'active'"})
    return f"Total records: {total}\nActive: {active}\n"

def _get_<domain>_stats():
    result = c3.<EntityType>.fetch({
        "filter": "...",
        "include": "id,<field>",
        "limit": 5000,
    })
    counts = {}
    for obj in (result.objs or []):
        key = (getattr(obj, "<field>", None) or "Unknown").strip()
        counts[key] = counts.get(key, 0) + 1
    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:20]
    lines = [f"  {name}: {cnt}" for name, cnt in top]
    return "<Domain> distribution:\n" + "\n".join(lines)
```

**Guidelines:**
- Use `fetchCount` for simple counts — faster than `fetch`.
- Use `fetch` with `limit: 2000–5000` for aggregations. Don't fetch unbounded sets.
- Return plain text, not JSON. Keep each function's output under ~500 chars.

### 2c. Intent classification

```python
def _classify_question(question):
    q = question.lower()
    intents = {"overview"}
    if any(w in q for w in ["distribution", "breakdown", "top", "rank"]):
        intents.add("<domain_a>")
    if any(w in q for w in ["trend", "over time", "recent"]):
        intents.add("<domain_b>")
    return intents

def _build_context(intents):
    parts = []
    if "overview" in intents:
        parts.append(_get_overview())
    if "<domain_a>" in intents:
        parts.append(_get_<domain_a>_stats())
    return "\n\n".join(parts)
```

### 2d. System prompt and entrypoint

```python
_SYSTEM_PROMPT = """You are a data analyst assistant for <AppName>.
Answer questions using only the provided data context.
Use markdown formatting: headers, bullet lists, tables, bold numbers.
If the data context does not contain enough information, say so clearly."""

def answerQuestion(self, question, chatHistory):
    intents = _classify_question(question)
    context = _build_context(intents)
    messages = []
    for entry in (chatHistory or []):
        q = entry.get("question") if isinstance(entry, dict) else getattr(entry, "question", "")
        a = entry.get("answer")   if isinstance(entry, dict) else getattr(entry, "answer", "")
        if q and a:
            messages.append({"role": "user",      "content": str(q)})
            messages.append({"role": "assistant",  "content": str(a)})
    messages.append({
        "role": "user",
        "content": f"DATA CONTEXT:\n{context}\n\nQUESTION: {question}",
    })
    return _bedrock_invoke_with_system(_SYSTEM_PROMPT, messages)
```

---

## Step 3 — Frontend: API layer

Create `ui/react/src/data/<appName>AnalysisApi.ts`:

```typescript
import { c3MemberAction } from '../c3Action';

export interface ChatHistoryEntry {
  question: string;
  answer: string;
}

export const answerQuestion = async (
  question: string,
  chatHistory: ChatHistoryEntry[] = [],
): Promise<string> => {
  const MAX_PAIRS = 5;
  const MAX_ANSWER_LEN = 800;
  const trimmedHistory = chatHistory
    .slice(-MAX_PAIRS)
    .map((e) => ({ question: e.question, answer: e.answer.slice(0, MAX_ANSWER_LEN) }));

  const result = await c3MemberAction(
    '<AppName>AnalysisService',
    'answerQuestion',
    {},                          // empty object = singleton
    [question, trimmedHistory],
  );

  if (typeof result === 'string') return result;
  if (result?.val && typeof result.val === 'string') return result.val;
  return JSON.stringify(result ?? 'No response received.');
};
```

---

## Step 4 — Frontend: ChatContext

Create `ui/react/src/contexts/ChatContext.tsx`.

This React context manages:

| State | Type | Purpose |
|-------|------|---------|
| `isOpen` | `boolean` | Whether the sidebar overlay is visible |
| `conversations` | `Conversation[]` | All conversations (newest first), each with `id`, `title`, `messages[]`, `createdAt` |
| `activeConversationId` | `string \| null` | The conversation currently displayed in the chat panel |
| `openTabs` | `string[]` | Ordered list of conversation IDs pinned as tabs |

Key methods:

| Method | Behavior |
|--------|----------|
| `toggleSidebar()` | Toggle overlay visibility |
| `startNewConversation()` | Create a conversation, add it as a tab, make it active |
| `setActiveConversation(id)` | Switch to a conversation, also ensure it's in the tab bar |
| `closeTab(id)` | Remove tab; if active, switch to nearest neighbor |
| `updateMessages(id, msgs)` | Sync a conversation's messages from the ChatTab component |
| `updateTitle(id, title)` | Set title from the first user message |

The `ChatMessage` type has:
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;        // Visible text (grows during typewriter)
  fullContent?: string;   // Full response (set when LLM returns)
  isTyping?: boolean;     // True while typewriter is animating
}
```

Wrap the app with `<ChatProvider>` in `App.tsx`.

---

## Step 5 — Frontend: ChatSidebar

Create `ui/react/src/components/Chat/ChatSidebar.tsx`.

The sidebar is a **fixed overlay** on the right edge of the viewport:

```tsx
className="fixed top-0 right-0 h-full ... shadow-xl z-40"
style={{ width }}
```

This ensures the page content underneath keeps its full width. The panel floats on top.

### Layout (top to bottom)

1. **Drag handle** — absolute-positioned 6px strip on the left edge. `onMouseDown` starts tracking; `mousemove` on `window` resizes between `MIN_WIDTH` (340) and `MAX_WIDTH` (800).

2. **Header row** — Three buttons: `+` (new chat), clock icon (toggle history/tabs view), `X` (close sidebar).

3. **Tab bar** — Shown when there are open tabs and not in history view. Each tab shows a truncated title and an X button (visible on hover). Active tab has an accent bottom border.

4. **Body** — One of three states:
   - **History view**: scrollable list of all conversations with title, message count, date, and an accent dot for conversations already open as tabs. Clicking one opens it as a tab.
   - **Active chat**: renders `<ChatTab key={activeConversationId} conversationId={activeConversationId} />`
   - **Empty state**: "No open chats" prompt with a "Start a new chat" button.

### Why `key={activeConversationId}` matters

The `key` prop forces React to **mount a fresh ChatTab instance** when switching conversations. This gives each conversation fully isolated state (fetch, animation, input). Without this, shared state would cause cross-contamination between tabs.

---

## Step 6 — Frontend: ChatTab

Create `ui/react/src/components/Chat/ChatTab.tsx`.

This is the **self-contained conversation panel**. Each instance owns:

| State | Purpose |
|-------|---------|
| `messages` | Local message array (initialized from context, synced back via `useEffect`) |
| `input` | Textarea value |
| `isFetching` | Whether an API call is in flight |
| `error` | Error message string |
| `rafRef` | `requestAnimationFrame` handle for typewriter |
| `stopRef` | Boolean ref to cancel typewriter |

### Typewriter animation

When the LLM response arrives:
1. Store the full text in `msg.fullContent`
2. Set `msg.isTyping = true`
3. Run `requestAnimationFrame` loop that advances `CHARS_PER_FRAME` (8) characters per frame
4. Update `msg.content` with the growing slice
5. When complete, set `isTyping = false`

A **skip button** (square icon) appears during animation. Clicking it cancels the rAF and sets content to the full response immediately.

### Auto-scroll

Uses `scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight` on message changes. This constrains scrolling to the message container only — **never use `scrollIntoView`** as it propagates to ancestor containers and causes page-level overflow.

### Message rendering

```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
  {msg.content}
</ReactMarkdown>
```

Custom `MD_COMPONENTS` handle tables with `overflow-x-auto` wrappers. Message bubbles have `overflow-hidden` to prevent content from blowing out the sidebar width.

---

## Step 7 — Wire up the top bar

In your `TopBar` component, add a chat toggle button:

```tsx
import { MessageCircle } from 'lucide-react';
import { useChat } from '../../contexts/ChatContext';

// Inside the component:
const { toggleSidebar, isOpen: isChatOpen } = useChat();

// In the JSX (between notification bell and user avatar):
<button
  type="button"
  aria-label="Toggle chat"
  title="Chat with AI assistant"
  className={`relative transition-colors ${
    isChatOpen ? 'text-accent' : 'text-secondary hover:text-primary'
  }`}
  onClick={toggleSidebar}
>
  <MessageCircle size={18} />
</button>
```

---

## Step 8 — App.tsx integration

```tsx
import ChatSidebar from './components/Chat/ChatSidebar';
import { ChatProvider } from './contexts/ChatContext';

export default function App() {
  return (
    <ChatProvider>
      <div className="h-screen flex max-w-full overflow-hidden">
        <SideNav />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto p-5 min-w-0">
            <Routes>
              {/* ... your routes ... */}
            </Routes>
          </main>
        </div>
        <ChatSidebar />
      </div>
    </ChatProvider>
  );
}
```

Note: `<ChatSidebar />` is **outside** the flex layout. It renders as a fixed overlay, so it never affects the main content sizing.

---

## Step 9 — Prevent page overflow

In `globals.css`, add:

```css
html {
  overflow: hidden;
}

body {
  overflow: hidden;
}
```

This prevents any element (including stray `scrollIntoView` calls) from scrolling the page itself. All scrolling happens within individual `overflow-auto` containers.

---

## Step 10 — Configuration prerequisites

The backend requires a configured AWS Bedrock auth entry:

```javascript
// Run in C3 console to verify
GenaiCore.Llm.Bedrock.Auth.forConfigKey("bedrock").getConfig();
```

No third-party HTTP libraries are needed — SigV4 signing uses stdlib `hashlib`/`hmac`/`urllib`.

### Alternative LLM providers

Replace `_bedrock_invoke_with_system` with your provider. The rest of the code is provider-agnostic.

**Using C3 GenaiCore.Llm:**
```python
def _c3_llm_invoke(system_prompt, messages):
    llm = c3.GenaiCore.Llm.forConfigKey("default")
    full_messages = [{"role": "system", "content": system_prompt}] + messages
    return llm.chat({"messages": full_messages}).content
```

---

## Customization guide

### Adding a new data domain

1. Write a `_get_<domain>()` function in the Python backend
2. Add keyword rules in `_classify_question()`
3. Call it in `_build_context()`
4. Add a suggested question to `SUGGESTED_QUESTIONS` in `ChatTab.tsx`

### Changing suggested questions

Edit the `SUGGESTED_QUESTIONS` array in `ChatTab.tsx`. Use 4–6 questions that showcase what your data model can answer.

### Adjusting typewriter speed

Change `CHARS_PER_FRAME` in `ChatTab.tsx`. Higher = faster. Set to `Infinity` to disable animation.

### Adjusting sidebar width bounds

Change `MIN_WIDTH`, `MAX_WIDTH`, `DEFAULT_WIDTH` in `ChatSidebar.tsx`.

---

## Common pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Page scrolls when chat response streams | Using `scrollIntoView` | Use `scrollTop` on the message container ref instead |
| Chat squeezes the main page content | Sidebar is in the flex layout flow | Make it `fixed top-0 right-0` with `z-40` — overlay, not in-flow |
| Switching tabs corrupts messages | Shared state between conversations | Key `ChatTab` by `conversationId` so React creates independent instances |
| `No response received.` in UI | `c3MemberAction` returned an object | Check the `typeof result === 'string'` unwrap logic in the API layer |
| Slow responses (>10s) | Too many `fetch` calls or large limit | Reduce limit, use `fetchCount`, or cache with `Cached` mixin |
| Token limit errors from LLM | Chat history too long | Trim history more aggressively (fewer pairs, shorter truncation) |
| Markdown tables overflow sidebar | No overflow containment on bubbles | Add `overflow-hidden` to message bubble divs |
| Singleton not resolving | Wrong instance arg in `c3MemberAction` | Pass `{}` (empty object), not `null` |
