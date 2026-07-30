# CLAUDE.md

本文件是 Claude Code（claude.ai/code）的**薄包装层**。项目规约的唯一正本是 [AGENTS.md](AGENTS.md)——Codex、Cursor、Aider、Continue、Zed 等工具都会自动加载它。Claude Code 不会自动读取 `AGENTS.md`，因此这里用 `@` 导入语法在会话开始时把正本展开进上下文。

编辑规约请**只改 `AGENTS.md`**，不要把内容复制回本文件——单一正本就是为了根治两份文档漂移的历史问题，也让你在各 harness 之间无缝切换时看到的都是同一份指引。

@AGENTS.md
