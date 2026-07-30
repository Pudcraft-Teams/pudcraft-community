# 项目文档索引

Pudcraft Community 的文档当前是纯 Markdown 形态（暂未上 VitePress 站点）。所有文档默认简体中文。

## 入口

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md)：第一次贡献者从这里开始

## 贡献者文档

- [`dev/setup.md`](./dev/setup.md)：开发环境搭建（Docker、env、初始化、跑各服务、跑测试）
- [`dev/architecture.md`](./dev/architecture.md)：架构概览（Web / Worker / WS / Postgres / Redis / Misskey 拓扑与生命周期）
- [`dev/data-model.md`](./dev/data-model.md)：数据模型导览（按业务域分组，含关系图与重要约束）

## 接口与基础设施

- [`API.md`](./API.md)：API 契约
- [`i18n.md`](./i18n.md)：国际化方案与抽取规则
- [`dependency-pins.md`](./dependency-pins.md)：依赖固定政策

## 用户使用文档

暂未撰写。第一版上线前先聚焦贡献者文档与开发节奏。

## AI 协作配置

仓库根的 `CLAUDE.md` 与 `AGENTS.md` 是给 AI 编码助手（Claude Code、Codex、Cursor 等）用的自包含指引，包含项目惯例、产品范围、踩坑教训等条目，便于 AI 在没有人工监督时也能正确工作。**人类贡献者无需阅读**——`CONTRIBUTING.md` 与 `docs/dev/*` 已经覆盖人类需要的全部信息。
