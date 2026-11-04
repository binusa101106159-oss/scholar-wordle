# Scholar cloud sync

Firebase project: scholar-wordle. The website stays on GitHub Pages. sync/firebase-config.js contains public web project identifiers, never an admin credential. The user reports enabling Google Authentication, authorizing the Pages domain, creating the default Standard database and publishing firestore.rules.

## Architecture and access

sync/client.js loads the pinned official Firebase SDK, restores auth, reads the user's state, then boots existing apps. sync/store.js is an account-scoped in-memory facade; it does not import legacy localStorage or persistently cache application/patient data. Only Firebase's login session persists. The user declined old browser-state migration.

Documents live under /users/{uid}/state/{base64url logical item ID}; exactly value (JSON string), revision (incrementing integer) and updatedAt (server timestamp). Transactions perform three-way reconciliation against the actual server revision. Logical deletes retain tombstones. Patients, per-law checks, per-document highlights, each puzzle and completion-ledger entries are independent items. Client items exceeding 800KB fail visibly.

Rules restrict a verified binusa101106159@gmail.com identity to its own UID path; no other paths are allowed. Independent fields, identified marks and check additions/removals merge. A new puzzle/Wordle round remains coherent; same-puzzle cell edits can merge. The latest confirmed ordinary-field edit wins; a stale patient edit cannot resurrect a deleted record. Case forms additionally preserve remotely changed fields untouched since the form opened. Wordle/ILO results deduplicate each round/attempt.

## State covered

- Laws: article checks, highlights and existing saved reader preferences/state.
- Guides, 特做, AMA: marks, saved reader preferences, positions/anchors and selected content.
- Notes/daily letters: existing saved selection/order/sidebar state.
- Wordle: settings, solved words, deduplicated stats, unfinished round/typing, guesses, hints, Blitz timer/score. Explicit legacy stats import is supported as a baseline; no automatic import.
- Sudoku/Crossword: puzzle, entries, selection, pencil marks, existing history, timers/completion.
- ILO: lesson/film, quiz/answers/results, comparison preferences, per-film normalized pan/zoom and display filters.
- Calculator/AAOS: current inputs/result. PBL pages: answers and existing saved page/preferences. Embedded review seeds are not uploaded for a signed-in user; API keys/credentials are excluded.
- Last selected main tab.

This is persistent app state, not hover animations or a historical log of every keystroke. Patient drafts retain the explicit Save workflow.

## Errors and privacy

Status distinguishes guest, connecting, pending, synced and error, with retry. Patient writes wait for acknowledgement and retain form drafts on rejection. Other failed changes remain in a memory queue, retry on reconnect/request and request a browser warning before leaving. Closing/killing a page before acknowledgement can lose unsynced memory state; it is never labelled synced. Public reading remains available if cloud initialization fails, without treating an empty failed read as writable authenticated state.

Sign-out waits for pending saves and clears displayed state through a new page boot. Browser-history restoration checks auth again. Service worker v119 only handles public same-origin GET assets; Firebase auth/Firestore responses are not intercepted or cached. Access rules and Google-managed transport/storage protection are not end-to-end encryption; do not claim E2EE.

## Validation and remaining acceptance

Pure tests cover independent merges, splits, deletions, puzzle coherence, deduplicated results, rejected writes/retry, confirmed patient saves, account clearing and edits during an in-flight write. Independent browser contexts plus a simulated transaction/listener backend cover patient CRUD, same-patient field merges, drafts/retries/deletion, actual checkbox clicks/concurrent checks, unfinished Wordle, Sudoku, AAOS, PBL live answers, native AMA mark creation/removal, ILO quiz recovery, auth clearing and responsive layouts. Test records are fictional and never uploaded to production.

The actual official Firebase 13.2.0 SDK initializes with the supplied configuration, boots the anonymous site and locks private cases. Real anonymous Firestore REST reads return 403 PERMISSION_DENIED. Emulator rule execution and real owner-authenticated cross-device writes have not yet been verified. The user must sign in on the live site to complete that acceptance; simulated tests are not claimed as real Firestore end-to-end verification.

Before publication: run the full site tests, preserve source content, check current main, bump the service worker cache, publish with an expected head and verify Pages/live guest boot.


## Navigation performance update (v119)

Unchanged writes are discarded; reversing a queued navigation change before it is sent also cancels the write. Reading a setting uses a per-key cached group rather than scanning the account. Serialization is deterministic, so document ordering changes do not trigger false UI refreshes. Firestore listeners apply changed document revisions only; metadata-only updates and the initial listener echo do not refresh readers.

Independent pending items commit in bounded multi-document transactions (up to16 small items, with a payload cap), instead of one sequential transaction per field. Navigation/reading-position updates coalesce for1.6 seconds; marks, checks and gameplay retain the short450ms debounce. The status explicitly says Saving position for background navigation; this is not a fresh login or account reload. Patient saves still require acknowledgement and no longer wait behind unrelated navigation writes. App files prefetch alongside auth initialization, while execution still waits for cloud hydration.

Added regression checks for zero status/redraw events on unchanged data, rapid navigation coalescing, batched writes, cached lookup scope, patient-save priority, incremental updates and cancelled navigation. Existing cross-device browser checks remain passing. Access rules and source content are unchanged.
