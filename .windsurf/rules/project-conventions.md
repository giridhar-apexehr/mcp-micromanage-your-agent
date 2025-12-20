---
description: Basic conventions for the project
trigger: always_on
---

- Strict Git-Flow workflow must be followed for all changes
- Create feature branches from develop
- Merge changes back to develop
- Never commit or push directly to main or develop branches
- If you find a `dev` branch, consider it equivalent to `develop` branch
- Always verify the current branch before committing
- Fetch and rebase frequently to stay up-to-date
- Follow conventional commit messages (feat, fix, docs, style, refactor, test, chore)
- Keep commit messages clear and descriptive
- Squash related commits before merging to develop
- Write commit messages in present tense
- Test your changes by running tests locally before committing
- Run type checking, linting and formatting before committing
- Ensure all checks pass before committing
- Address all feedback and receive approval for merging