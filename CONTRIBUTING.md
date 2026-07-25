# Strike Team Protocols

This document outlines the standard operating procedures and confidentiality protocols for the myCPC strike team.

## Confidentiality Notice
> [!WARNING]
> This repository is proprietary and confidential. Do not share, fork, or publicly distribute any part of this codebase. 

## Branching Strategy
- **DO NOT push to `main` directly.**
- Create a feature branch off of `main`: `git checkout -b feature/your-feature-name`.
- Commit your changes with descriptive messages.
- Push your branch to the remote repository.
- Submit a Pull Request (PR) and wait for a review from the lead maintainer.

## Dependency Management
- **Strictly use Lockfiles:** Do not use `npm install` for regular development unless adding a new package. Use `npm ci` to ensure your local machine runs the exact same dependencies as the master branch.
- Ensure that `package-lock.json` is always committed with any dependency changes.
