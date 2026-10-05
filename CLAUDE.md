# CLAUDE.md

## Agent & Workflow Constraints

These apply to every session and every agent working in this repo.

- Do not spawn parallel sub-agents or dynamic workflows for single-file edits or simple refactors.
- For complex orchestration there is no cap on concurrent agents: use as many as the task needs to finish as fast as possible.
- Instruct sub-agents to use lower-tier models (e.g., Sonnet 5 or Haiku) for mechanical tasks rather than inheriting Opus xhigh parameters: pass the model (and a lower effort) explicitly on every sub-agent and workflow agent.
