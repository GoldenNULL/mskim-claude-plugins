---
name: instruction
description: Creates a task instruction document (a Markdown file) so that the current session or another session/agent can carry out work such as adding a feature, fixing a bug, or analysis smoothly and clearly, and provides a task prompt to hand over with that document at the end of the response.
argument-hint: "[content for building the task instruction document]"
disable-model-invocation: true
---

# Writing a Task Instruction Document + Task Prompt

Input: $ARGUMENTS

## Purpose

The output of this skill is **preparation for doing the actual work (adding a feature, fixing a bug, analysis, etc.)**. Whether the current session continues, or another session or agent takes over, the worker must be able to start correctly right away from this document alone, without getting lost.

The output is always two things.

1. **Task instruction document**: a Markdown file containing all the context and criteria the work needs.
2. **Task prompt**: a short prompt to hand to a session or agent together with that document. Give it as a code block at the **very end** of the response.

The document is the body that holds "what, why, and by what criteria"; the prompt is the starting signal that says "read this document and start like this." Do not copy the document's content into the prompt again. When content lives in two places, only one side gets updated and the two drift apart.

## 1. Gather context

Assume the reader does not know this conversation and cannot ask questions. Write only facts you have verified. That way the receiving side can trust the document and act on it.

- Open any files, folders, code, or documents mentioned in the input or conversation yourself, and record their actual paths, names, and current state.
- Carry over, without omission, decisions already made in the conversation, approaches tried and abandoned along with the reasons, and the user's corrections. This is the key information that keeps the receiving side from repeating the same mistakes.
- Do not make up anything you could not verify; mark it `needs verification`.

## 2. Review ambiguities and ask questions

Before writing the document, list the parts of the gathered context that are ambiguous or missing, and sort each into one of two groups. A document written on a wrong interpretation leads the receiving side precisely in the wrong direction, so do not skip this review.

- **Things only the user can decide**: interpretation of requirements, goals and priorities, scope, choice of behavior (e.g., block it or only log it), and facts you cannot learn from code or documents, such as a target path. The answer changes the document's design or scope.
- **Things the receiving side can check on its own**: things you can learn by looking at code, documents, or tools, such as library versions, file structure, or build commands. Do not ask the user; write `needs verification` and how to verify it in the document.

If there are items only the user can decide, **ask the user before writing the document.**

- If a question tool (e.g., `AskUserQuestion`) is available, use it; otherwise write the questions in the response and wait for answers.
- Ask at most 4 at once, starting with the ones whose answers change the document the most. Attach concrete options and a recommendation to each question so the choice is easy, but the options are only examples and the user must be able to write an answer that is not among them. The user's real intent may lie outside the options.
  - `AskUserQuestion` automatically adds a free-text field ("Other"), so do not add one to the options yourself.
  - When writing questions in the response without a tool, end each question with an item such as "Your own answer: feel free to write it if you have something else in mind."
- An answer the user writes themselves takes priority over the options and is reflected as is. If the answer mixes in an existing option (e.g., "A, but this part different"), reflect it mixed as is.
- Do not ask about things already answered in the input or materials. Too many questions make the skill a chore to use.
- Once you have the answers, reflect them in the document as confirmed items. If the user answers something like "you decide," go with the recommendation and record it in the document as an assumption.
- If there are no items only the user can decide, do not ask; write the document right away.

In an environment where you cannot ask (such as an automated run that cannot receive user responses), write with the recommendations, and clearly state those items as open items in the document and as "assumptions made" in the response.

## 3. Document structure

Use the order below as the default, but drop sections with no content and trim to fit the size of the task. Do not pad a small task with empty sections.

```markdown
# <Task title>

## Purpose
Why this work is being done and what changes when it is finished, in 1–3 sentences.

## Background / Current state
What has been done so far, related files and systems (absolute paths), decisions already made, approaches tried and ruled out and why.

## Scope
- In: …
- Out: … (things not to touch)

## Work
1. Concrete steps in the imperative. Make each step's output visible.

## Constraints / Rules
Conventions to follow, prohibitions, tools and versions to use, actions that need user approval. Attach a one-line reason to each constraint.

## Done criteria
As verifiable conditions. ("Build passes", "File X contains item Y")

## Verification
Commands to run, screens or output to check.

## Reporting
What to return when finished, and in what form.

## References
File paths, links, related documents.

## Open items
`needs verification` items, and things the receiving side must judge or ask the user about.
```

Depending on the kind of work, include the following in "Background / Current state" or "Work".

- **Bug fix**: symptoms, reproduction steps, expected vs. actual behavior, suspected areas. If the cause is unknown, make "find the cause" the first step.
- **Feature addition**: requirements, user-visible behavior, affected interfaces and data.
- **Analysis / investigation**: the questions to answer, judgment criteria, output format (report, table, recommendation).

## 4. Writing principles

- **Self-contained**: do not use expressions like "as mentioned earlier" or "like the result above." The reader has no "earlier."
- **Concrete**: use absolute paths and real names instead of relative paths and pronouns. Write criteria instead of "appropriately" or "well."
- **Carry over conclusions**: do not list the investigation process; summarize only the facts found and their evidence.
- **Language**: write the body in Korean. Keep code identifiers, paths, commands, error messages, and product names in their original form.

## 5. Saving

- If the user specifies a location, save it there. Otherwise, save it under `instructions/` in the current working folder as `<YYYY-MM-DD>-<task-summary>.md`. Keeping it inside the target project lets any session find it at the same path.
- If a file with the same name exists, confirm before overwriting it.

## 6. Task prompt

Assume the receiving side can open the document file, and put only what is needed to start in the prompt.

- The document's **absolute path** and an instruction to "read it all the way through first"
- A one-line summary of the work
- 1–3 key constraints from the document that must not be broken (mainly ones that prevent irreversible actions by mistake)
- How to start: the first step, and what to do on hitting an open item (check it on its own, or ask the user)
- An instruction to report according to the document's "Reporting" section when finished

If the user says the receiving side cannot access the file (another PC, a web chat, etc.), put the full document inside the prompt's code block instead of the path.

## 7. Response format

Answer in the following order. The prompt goes at the very end so the user can easily copy and paste it right away.

1. The saved document path and a 2–3 line summary of the key points
2. List of `needs verification` / open items (only if any)
3. At the very end: one task prompt as a code block
