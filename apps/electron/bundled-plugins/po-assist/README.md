# PO Skill Plugin

Claude Code plugin packaging for the current `po-skills` skill set and flat slash commands.

## Structure

- `skills/po-skills/` contains the full skill implementation.
- `commands/` contains slash-command entrypoints discovered by Claude Code.
- `agents/` contains plugin subagents. Cloud document browser download is currently disabled in PO Assist flows.

## Local validation

Recommended validation path:

```bash
ln -s /Users/qinxiao/WorkSpace/ht-skills/plugins/po-assist ~/.claude/plugins/po-assist
```

Then restart or reopen Claude Code so it can rescan plugins.

## Notes

- MCP servers: `chrome-devtools` (browser automation) + `drawio` (diagram editor).
- `chrome-devtools` is configured with an isolated `--userDataDir` profile for browser automation. PO Assist does not use it for EIP/LinkApp cloud document download; cloud documents must be downloaded manually and then converted as local files.
- Plugin subagents are loaded at Claude Code session start. Restart or reopen Claude Code after adding or editing files in `agents/`.
- Keep skill content under `skills/po-skills/`. Command entrypoints are generated into `commands/`.
- Update placeholder manifest fields in `.claude-plugin/plugin.json` before external distribution.
