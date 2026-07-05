---
name: pgm-address-comments
description: Address a human's unresolved review comments on a pgm ticket's own PR — make the code change and reply "addressed" where the comment is actionable, or reply with a clarifying question where it's ambiguous. Use when the user runs /pgm-address-comments <TICKET_ID>, or says "address the PR comments", "answer the review comments", "handle the review feedback" for a pgm ticket that is In Review.
---

# pgm-address-comments — close the reverse review loop

Invokable action command. Runs **in the current repo** on **one** pgm ticket that is already
`In Review` with an open PR. Reads the ticket's `pr:` field, fetches the PR's **unresolved**
inline review threads, and for each: makes a code change + commit if the comment is actionable,
or replies with a clarifying question if it's ambiguous. Every PGM-authored reply is prefixed
`[PGM_BOT]` (loop-guard). Follow the `pgm` skill's rules — this command **never changes the
ticket's `status:`** (it stays `In Review` throughout) and **never resolves a thread** (that's a
human action).

`ARGUMENTS` must carry a single ticket id (`PGM-00004`, `00004`, or `4`). No id → ask for one.
No auto-discovery, no flag mechanism, no fan-out — one ticket per run, invoked by the human.

## Procedure

1. **Locate the board + ticket.** Confirm `pgm/` exists in the current repo. Resolve the id to its
   `pgm/<KEY>-#####.md`. Read its frontmatter.
2. **Get the PR.** Read the `pr:` field from the ticket frontmatter (persisted by `board.py review`,
   PGM-00001). No `pr:` → stop and tell the user the ticket has no PR recorded (run
   `board.py review <id> "<pr-url>"` first, or the ticket isn't In Review yet). Parse `owner/repo`
   and the PR number from the url.
3. **Fetch unresolved threads (GraphQL — REST has no resolved/unresolved field).**
   ```
   gh api graphql -f query='
     query($owner:String!, $repo:String!, $pr:Int!) {
       repository(owner:$owner, name:$repo) {
         pullRequest(number:$pr) {
           reviewThreads(first:100) {
             nodes {
               id isResolved isOutdated
               comments(first:100) {
                 nodes { databaseId body path line author { login } createdAt }
               }
             }
           }
         }
       }
     }' -F owner=<owner> -F repo=<repo> -F pr=<number>
   ```
4. **Loop-guard — filter which threads to act on.** For each thread, skip it when:
   - `isResolved` is true (already resolved — leave it), **or**
   - the **latest** comment's `body` already starts with `[PGM_BOT]` (PGM already answered this
     thread; don't reply again and don't re-address).
   Everything else is an open thread awaiting a first PGM response.
5. **Per open thread — decide, then act.** Read the comment (its `path`, `line`, `body`).
   - **Actionable** (a concrete, unambiguous change request): make the code change, commit on the
     PR's existing branch with the `<KEY>-#####` in the message (or the ticket's `jira:` key if it
     has one), then reply `[PGM_BOT] addressed — <one line on what changed>` threaded via REST
     (step 6). **Push commits to the existing PR branch directly — no ask-before-push** (same
     auto-push carve-out as `/pgm-codeit`; the command is the standing authorization).
   - **Ambiguous** (unclear intent, multiple valid readings, needs a product/design call): make
     **no** code change; reply `[PGM_BOT] <clarifying question>` instead of guessing.
6. **Reply threaded via REST** (`in_reply_to` keeps it in the same thread; use the thread's first
   comment `databaseId`):
   ```
   gh api repos/<owner>/<repo>/pulls/<pr>/comments -f body='[PGM_BOT] …' -F in_reply_to=<comment_id>
   ```
7. **Write the transcript.** Create/update a `## PR Conversations` section in the ticket body,
   updated **in place per thread each run** (find the thread's existing block by `file:line` +
   thread id and rewrite it; append new threads). This is agent context for future sessions, not a
   polished UI — GitHub is the UI for reading the live conversation. Per thread record: `file:line`,
   thread state (open/resolved/outdated), the human's comment, and PGM's reply + action (commit sha
   if any, or "clarifying question"). Hand-editing the body is fine (only `status:`/board-table are
   off limits per the `pgm` skill).
8. **Report + stop.** Summarize: threads seen, addressed (with commit shas), questioned, skipped.
   **Do not** call `board.py review`/`working`/anything that moves status — the ticket stays
   `In Review`. **Never** call GitHub's `resolveReviewThread` mutation.

## Guardrails
- One ticket per run. Ticket `status:` never changes; threads are never resolved by PGM.
- Every PGM reply is `[PGM_BOT]`-prefixed — the loop-guard depends on it; never omit it.
- Never guess on an ambiguous comment — ask. Only commit code for clear, actionable requests.
- Push straight to the existing PR branch (auto-push carve-out); do not open a new branch or PR.
