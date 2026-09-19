# GitHub main to GitLab

GitHub is the source of truth. The `Mirror main to GitLab` Actions workflow
copies current `main` to <https://gitlab.com/Ducksss/lta-hack> after each GitHub
`main` push, including merged pull requests. It can also be run manually from
GitHub Actions on `main`. It does not depend on a developer's laptop.

Only `main` is synchronized. Updates are fast-forward only: GitLab-only changes
cause a visible failure rather than being overwritten. Make changes on GitHub.
The workflow checks out the latest main when it starts, serializes runs and
checks the destination commit after pushing. It does not synchronize issues,
merge requests, repository settings, other branches or tags.

## Credential setup

Use a dedicated Ed25519 deploy key enabled only for `Ducksss/lta-hack`, with
write access and explicit permission to push its protected `main` branch.
Store the private half only in the GitHub repository Actions secret
`GITLAB_MIRROR_SSH_KEY`. Never use a personal SSH private key or commit either
credentials or tokens. This is a CI secret, not an application environment
variable; no `.env` changes are required.

The workflow pins the checkout action to a commit, grants the GitHub token only
read access, does not run application code, uses a pinned GitLab SSH host key,
and removes its temporary private key on exit. Pull requests and other branches
cannot trigger the mirroring job. Repository writers can modify Actions
workflows; protect GitHub main and control repository write access accordingly.

## Verification and recovery

Check the workflow run in GitHub Actions and compare both `main` commit IDs:

```sh
git ls-remote https://github.com/pavan2184/LTA-Hack.git refs/heads/main
git ls-remote git@gitlab.com:Ducksss/lta-hack.git refs/heads/main
```

If a run fails, inspect its error, restore or rotate the dedicated key if
necessary, and rerun on `main`. Resolve divergent GitLab work through GitHub;
do not force push merely to make the mirror green. A GitLab host-key change
requires independent verification before updating the pinned key.

The GitLab project was private at setup. Mirroring does not grant judges access
or change visibility; verify judge membership separately before submission.
