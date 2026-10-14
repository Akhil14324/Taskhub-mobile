# TaskHub QA Guide

Welcome. This guide explains how to test TaskHub and how to report back. The test cases are in
`QA_TESTING_SHEET.csv` (200 cases). Open it in Excel or Google Sheets (File > Import > Upload).

## 1. The rules (please read first)

1. **Never push to `main`.** Do all your work on your own branch and open a **Pull Request (PR)**. Only the
   owner merges PRs.
2. **No database migrations.** Do not add, edit or delete anything in `vgrand-taskhub-backend/src/migrations/`
   and do not run `npm run migrate`. If you think the database needs a change, write it in your report and stop.
3. **Do not start the backend against the live database.** The backend `.env` points to the real Supabase
   database. Test only on the deployed app (https://vgrand-task-hub.vercel.app) with the test account you were given.
4. **Use only your test account.** Do not change other people's tasks, passwords or chats. Create your own test
   data and delete it afterwards.
5. **Do not share passwords** in the sheet, screenshots or PRs. Blur them out.
6. If something is unclear or you are blocked, mark the case `BLOCKED` and write why. Do not guess.

## 2. What you need

- Chrome or Edge on a laptop, plus one Android or iPhone with the PWA installed.
- The test login from the owner. Two test accounts are needed for chat, sharing and approval cases.
- Browser dev tools (F12) for the few cases that edit Local Storage to speed up reminders.

## 3. How to run a test case

For every row in the sheet:

1. Read **Area**, **Test** and **Steps**. Do exactly the steps.
2. Compare what you see with **Expected result**.
3. Fill in the row:
   - **Result**: `PASS` (matches), `FAIL` (does not match), or `BLOCKED` (could not test).
   - **Device and browser**: for example `Pixel 8 / Chrome 130` or `Windows / Edge`.
   - **Actual result**: one or two plain sentences on what you saw. Always fill this for FAIL.
   - **Screenshot or link**: a screenshot or short screen recording for every FAIL.
   - **Tested by** and **Date**.
4. Do not edit the Steps or Expected columns. If a case looks wrong, say so in Actual result.

## 4. Speeding up the timed features

Water, stretch and focus work on timers, so you can set their saved state in the browser: F12 >
Application > Local Storage > the site. Then reload.

| Feature | Key | What to change |
| --- | --- | --- |
| Water | `th.water.<userId>` | set `"next": 0` to get the card now; set `"count"` to test 7 or 8 glasses; set `"day"` to yesterday to test the reset |
| Stretch | `th.stretch.<userId>` | set `"next": 0` to get the pop-up now |
| Focus (running) | `th.focus.run.<userId>` | set `"end"` to a time in the past to finish the session |
| Focus (totals) | `th.focus.stats.<userId>` | shows today's minutes and sessions |

Notes on how the features are meant to work (so you know what to expect):

- **Water reminder**: a drop in the header shows today's glasses out of 8 (250 ml each, 2 litres). Between
  08:00 and 21:00 a card asks you once an hour. **I drank it** needs a photo (camera on phones, file picker on
  desktop); the photo is not checked, it is only a habit nudge. **Snooze** asks again in 15 minutes. It stops
  once 8 glasses are done. It only runs while TaskHub is open and is stored on that device.
- **Stretch break**: between 09:00 and 19:00, every two hours, one guided stretch with a 60 second timer. Done
  unlocks when the minute is up. Snooze is 15 minutes. The first one comes about 40 minutes after opening.
- **Focus mode**: choose 15, 25, 45, 60 or 90 minutes (optionally a task). The screen goes full screen and
  landscape where the browser allows it. Banners and reminders wait, but the task bell still breaks through.
  Leaving the app is counted and shown at the end. The session survives a reload.
- **Pick for me**: picks one open task at random, favouring overdue, close deadlines and high priority, and
  tells you why. Blocked, on hold, in review, done and undecided proposals are never picked.
- **Feature switches** (Profile > Features) are per person and follow the account to other devices.
- **Overdue roast** is off by default.

## 5. How to report back

1. **Daily**: send the owner your updated sheet (or the link) at the end of the day with a 3-line summary:
   how many cases done, how many PASS, how many FAIL.
2. **Every FAIL** needs: the case ID (for example `QA-042`), the steps you did, what you expected, what happened,
   the device and browser, and a screenshot or recording.
3. **Blocking bugs** (login broken, data loss, crash, someone seeing another person's private data): tell the
   owner straight away, do not wait for the daily report.
4. **Severity** (add to Actual result): `S1` crash or data loss, `S2` feature broken, `S3` wrong but usable,
   `S4` cosmetic.
5. Do not fix bugs yourself unless the owner asks. If asked to fix, follow section 6.

## 6. Working with the code (only if asked)

1. `git checkout main && git pull`
2. `git checkout -b qa/<short-description>` (example: `qa/water-snooze-fix`)
3. Make a small change. Check it builds: `npm run build:web` (mobile repo) or `npm test` (backend repo).
4. Commit with a clear message and `git push -u origin qa/<short-description>`.
5. Open a **Pull Request** into `main` on GitHub. Describe what you changed and which QA IDs it fixes.
6. Wait for review. **Do not merge it yourself and never push straight to `main`.**
7. No migration files, ever (see rule 2).

## 7. Suggested order

1. Login and account (QA-001 to QA-012)
2. Water, stretch, focus, Pick for me and Feature switches
3. To-dos and Views
4. Business tasks (needs the second account)
5. Chat and Notifications (needs the second account)
6. Everything else, then PWA and devices on a real phone last

Sections: Login and account, Water reminder, Stretch break, Focus mode, Pick for me, Feature switches, To-dos,
Views and layouts, Business tasks, Chat, Notifications, Organisation and profile, Stand-up goals and engagement,
Shortcuts and search, PWA and devices, Overdue roast, Security and negative tests.

Thank you, and good luck.
