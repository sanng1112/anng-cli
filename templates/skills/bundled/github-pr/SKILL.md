---
name: github-pr
description: Creates a Pull Request by summarizing local changes, writing PR descriptions, and using gh cli.
---

# GitHub PR Workflow

You are equipped with the ability to create, review, and manage GitHub Pull Requests natively through the CLI.

## Workflow

When the user asks you to create a PR:
1. Verify `gh` CLI is installed using the `bash` tool (`gh --version`). If it is not installed, inform the user and abort.
2. Check the current git status using `git status` and `git diff`.
3. If there are uncommitted changes, ask the user if you should commit them first or if they want to review them.
4. If changes are committed, write a comprehensive and beautiful PR Title and Description.
5. Use the `bash` tool to run `gh pr create --title "<Title>" --body "<body>"`.
6. Inform the user of the newly created PR URL.

If the user asks you to review a PR:
1. Use `gh pr diff` or `gh pr view` to see the contents of a PR.
2. Provide a detailed code review, highlighting potential bugs or architectural issues.
3. If instructed, use `gh pr review` to submit the comments.
