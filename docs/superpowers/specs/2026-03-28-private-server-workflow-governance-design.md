# 私密服务器流程与协管权限重构设计

> 日期: 2026-03-28
> 状态: 已确认，待进入 implementation plan
> 范围: 私密服务器申请、邀请、成员、白名单同步、协管权限、相关页面交互

## 背景

当前私密服务器模块已经有基础实现，但仍存在几个结构性问题：

- 同一用户可能同时存在成员身份和遗留申请状态，状态机不一致。
- 邀请加入、申请审批、成员移除之间缺少统一的冲突处理。
- `WhitelistSync` 对移除动作缺乏持久化追踪，控制台和补偿链路不完整。
- 私密服务器管理接口普遍写死为 owner 权限，无法支持协管。
- 详情页、申请页、邀请页和控制台页面尚未围绕同一用户状态做统一渲染。

本次重构的目标是把私密服务器域抽成一套自洽的成员与治理模型，在不重做整个服务器系统权限架构的前提下，一次性补齐流程闭环。

## 目标

- 收敛私密服务器用户状态，确保同一时刻只有一个“当前真相”。
- 引入私密服务器协管角色，支持 owner 授权日常管理。
- 让申请、邀请、成员加入/离开、白名单同步全链路一致。
- 让控制台和详情页只呈现一个明确动作，避免状态打架。
- 保留历史申请与同步记录，为后续排障与审计留痕。

## 非目标

- 不重构公开服务器编辑、删除、认领等公开域权限。
- 不引入更细粒度的协管权限模板。
- 不做邀请码备注、黑名单、批量邀请码、复杂成员组织等扩展功能。
- 不改插件协议主结构，只补齐现有同步记录与状态追踪。

## 核心设计

### 1. 私密服务器成员模型升级

`ServerMember` 从“已加入成员表”升级为“私密服务器成员与角色表”。

新增或调整字段：

- `role`: `OWNER | ADMIN | MEMBER`
- `joinedVia`: `claim | apply | invite`
- 保留 `mcUsername`
- 保留 `@@unique([serverId, userId])`
- 新增 `@@index([serverId, role])`

约束：

- 每个服务器在私密服务器域内只能有一名 `OWNER`。
- `Server.ownerId` 继续作为公开域所有权字段保留。
- 只有进入私密服务器域的服务器才要求同步 `OWNER` 成员记录，判定条件为 `visibility != public`。
- 对纯公开服务器，`Server.ownerId` 仍然独立于私密成员模型，私密成员真相源规则不生效。
- 对 `visibility != public` 且 `Server.ownerId` 非空的服务器，必须存在一条同步的 `ServerMember(role=OWNER)` 记录。

数据库层增加 partial unique index：

```sql
CREATE UNIQUE INDEX server_members_one_owner_per_server_idx
ON server_members (server_id)
WHERE role = 'OWNER';
```

说明：

- 该约束允许公开服务器在 `server_members` 中不存在任何 `OWNER`
- 一旦存在 `OWNER` 记录，同一服务器最多只能有一条
- 对私密服务器“必须存在且只能有一条 OWNER”由服务层和迁移回填共同保证

### 2. 申请模型从“单记录覆盖”改为“保留历史”

`ServerApplication` 不再使用 `unique(serverId, userId)` 复用同一条记录。

改为：

- 允许一个用户对同一服务器存在多条历史申请记录。
- 同一时间只允许一条 `pending` 申请。
- `approved` 表示这条申请曾通过，不表示当前仍持有成员身份。
- 当前成员资格的唯一真相源是 `ServerMember`。
- 面向玩家端的 membership payload 不把“无成员但最近申请是 `approved`”渲染成活跃状态；这类记录只作为残余历史保留。

数据库层使用 PostgreSQL partial unique index 约束：

```sql
CREATE UNIQUE INDEX server_applications_one_pending_per_user_idx
ON server_applications (server_id, user_id)
WHERE status = 'pending';
```

### 3. 白名单同步记录独立持久化

`WhitelistSync` 改成可以脱离成员记录存在，保证 remove 事件不会因成员删除而丢失。

字段调整：

- `memberId` 改为 nullable
- `member` relation 改为 optional，不再 cascade 删除历史 sync
- 新增 `targetUserId`
- 新增 `mcUsernameSnapshot`
- 新增 `targetRoleSnapshot`
- 新增 `source`

`source` 取值：

- `owner_bootstrap`
- `apply_approve`
- `invite_join`
- `member_remove`
- `self_leave`

约束：

- 所有 `add` / `remove` 都必须生成一条 `WhitelistSync`
- 删除成员前先写 `remove` sync，再删成员
- 控制台展示 recent sync 时优先使用快照字段，不依赖成员记录存活

## 状态机

### 用户当前状态

用户在某服务器下的当前状态由下列信息组合得出：

- 当前是否存在 `ServerMember`
- 当前角色 `role`
- 最近一条申请状态

渲染和业务逻辑应遵循以下优先级：

1. 只要存在 `ServerMember`，页面统一视为“已加入”
2. 只有不存在 `ServerMember` 时，才看最新申请状态
3. 若无成员且无申请，则视为“未加入”
4. 若无成员且最近历史申请为 `approved`，页面仍视为“未加入/已离开”，并通过残余历史标记暴露给调用方

### 状态定义

- `未加入`: 无 `ServerMember`，可有历史申请
- `申请中`: 无 `ServerMember`，存在最新 `pending` 申请
- `已加入`: 存在 `ServerMember`
- `已离开/被移除`: 无 `ServerMember`，但保留历史申请与 sync

### membership payload 归一化规则

`GET /api/servers/:id/membership` 返回给玩家端的状态必须是归一化后的显示状态，而不是直接暴露原始申请表状态。

规则：

- 若存在 `ServerMember`，返回成员态，不再暴露 `latestApplication` 作为主状态
- 若不存在 `ServerMember`：
  - 最近申请为 `pending`，返回 `latestApplication.status = pending`
  - 最近申请为 `rejected`，返回 `latestApplication.status = rejected`
  - 最近申请为 `cancelled`，返回 `latestApplication.status = cancelled`
  - 最近申请为 `approved`，则 `latestApplication` 置空，并返回 `hasResidualHistory = true`

这样保证玩家端显示态只落在：

- 已加入
- 申请中
- 申请未通过
- 申请已撤回
- 未加入

### 关键状态流转

#### 申请加入

- 非成员可创建新申请
- 已有 `pending` 申请时返回 `409`
- `rejected` / `cancelled` 后允许重新申请，直接新建一条记录

#### 审批通过

- 审批前必须检查是否已存在成员记录
- 若用户已通过其他方式成为成员，返回业务冲突，不再硬撞唯一约束
- 审批通过后：
  - 创建 `ServerMember(role=MEMBER, joinedVia=apply)`
  - 写入 `WhitelistSync(action=add, source=apply_approve)`

#### 邀请加入

- join 前必须校验服务器当前 `joinMode` 支持邀请
- 若用户已是成员，返回 `409`
- 若用户存在 `pending` 申请：
  - 同事务将该申请改为 `cancelled`
  - `reviewNote` 写入“已通过邀请码加入自动关闭”
- 成功加入后：
  - 创建 `ServerMember(role=MEMBER, joinedVia=invite)`
  - 写入 `WhitelistSync(action=add, source=invite_join)`

#### 主动退服

- `MEMBER` 和 `ADMIN` 可以主动退服
- `OWNER` 不允许主动退服
- 退服流程：
  - 写入 `WhitelistSync(action=remove, source=self_leave)`
  - 删除成员记录

#### 被移除

- `OWNER` 可移除 `ADMIN` / `MEMBER`
- `ADMIN` 只能移除 `MEMBER`
- 移除流程：
  - 写入 `WhitelistSync(action=remove, source=member_remove)`
  - 删除成员记录

## 权限模型

### 角色

- `OWNER`: 私密服务器主负责人，与 `Server.ownerId` 对应
- `ADMIN`: 协管，可执行日常私密服务器管理
- `MEMBER`: 普通成员

### 权限边界

#### OWNER

可执行：

- 修改私密服务器设置：`visibility`、`discoverable`、`joinMode`、`applicationForm`
- 审批申请
- 管理邀请码
- 管理成员
- 提升/降级协管
- 查看和重置 API Key
- 查看同步状态

不可让渡给 ADMIN 的能力：

- 修改公开服务器基础资料
- 删除服务器
- 转移所有权

#### ADMIN

可执行：

- 审批申请
- 管理邀请码
- 查看成员列表
- 移除普通成员
- 查看同步状态

不可执行：

- 修改私密策略设置
- 提升/降级他人角色
- 移除 `OWNER`
- 移除其他 `ADMIN`
- 查看或重置 API Key
- 删除服务器
- 修改公开服务器基础资料
- 转移所有权

#### MEMBER

可执行：

- 查看自身成员状态
- 主动退服

### 权限实现方式

新增统一私密服务器权限服务层，所有私密服务器路由都不再散写 `ownerId === userId`。

建议提供：

- `getServerActorContext(serverId, userId)`
- `requireServerRole(serverId, userId, allowedRoles)`
- `syncServerOwnerMembership(tx, args)`

其中 `args` 使用显式分支，而不是可选参数碰运气：

- 公开目标：
  - `{ serverId, nextOwnerId, targetVisibility: "public" }`
- 私密目标：
  - `{ serverId, nextOwnerId, targetVisibility: "private" | "unlisted", ownerMcUsername: string }`

实现可以在“新 owner 已有成员记录”时忽略传入的 `ownerMcUsername`，但私密目标调用方仍必须提供该值，避免调用时机不明确。

返回信息应至少包含：

- `serverId`
- `ownerId`
- `membershipId`
- `role`
- `availableCapabilities`

### 所有权变更规则

公开域的所有权变更仍不在本次功能内重构，但必须定义私密域同步规则，避免残留两个 `OWNER`。

规则：

- 任何已有的 owner 变更、重新认领、转让流程，只要最终修改了 `Server.ownerId`，都必须通过统一服务完成，不允许裸写 `Server.ownerId`
- ownerId 更新与 `syncServerOwnerMembership(...)` 必须在同一数据库事务内完成，保证公开域 owner 与私密域角色不会短暂分离
- 触发点至少包括：
  - 认领成功
  - 所有权转让成功
  - 任何管理员工具直接修改 `ownerId`
- `visibility` 从 `public` 切换为 `private | unlisted` 时，也必须在同一数据库事务内调用 `syncServerOwnerMembership(...)`
- 对 `visibility = public -> private | unlisted` 的切换：
  - 若 `ownerId` 为空，设置变更直接拒绝
  - 调用方必须按私密目标签名提供 `ownerMcUsername`
  - 若新 owner 当前没有成员记录且无法提供 `ownerMcUsername`，设置变更必须中止，不能接受“服务器已变私密，但 OWNER 成员记录缺失”的中间态
- 对 `visibility = private | unlisted -> public` 的切换：
  - 不要求删除现有成员、申请、邀请或 sync 历史
  - 私密域的“必须存在 OWNER 成员记录”约束自此不再强制执行
- 对 `visibility = public` 的服务器，仅更新 `Server.ownerId`，不强制维护私密成员角色
- 对 `visibility != public` 的服务器：
  - 新 owner 若已有成员记录，提升为 `OWNER`
  - 新 owner 若无成员记录，则创建 `ServerMember(role=OWNER, joinedVia=claim)`，并使用调用方提供的 `ownerMcUsername`
  - 旧 owner 若存在 `OWNER` 成员记录，降级为 `MEMBER`
  - 不自动把旧 owner 提升为 `ADMIN`
- 若新 owner 原本不是该私密服务器成员，但本次变更创建了新的 `OWNER` 成员记录，则必须写入 `WhitelistSync(action=add, source=owner_bootstrap)`
- 若新 owner 原本已是 `MEMBER` / `ADMIN`，不额外生成 add sync，因为白名单成员资格已存在
- 所有权变更本身不自动为旧 owner 生成 remove sync；旧 owner 保留成员资格并降级为 `MEMBER`

## API 设计

### 保留并增强的接口

#### `GET /api/servers/:id/membership`

这是玩家端专用的当前 actor 状态接口，不用于控制台审批、审计或历史查询。返回：

- `isMember`
- `role`
- `membershipId`
- `latestApplication`
- `hasResidualHistory`
- `availableActions`

其中：

- `isMember = true` 时：
  - `role` 必须为 `OWNER | ADMIN | MEMBER`
  - `membershipId` 必须为非空
- `isMember = false` 时：
  - `role = null`
  - `membershipId = null`
- `latestApplication` 仅用于玩家端显示态时，只返回 `pending | rejected | cancelled`
- `hasResidualHistory` 默认为 `false`
- 若最近历史申请是 `approved` 但当前无成员，则返回 `latestApplication = null` 且 `hasResidualHistory = true`
- 控制台如需完整历史，必须继续使用 `GET /applications`、`GET /members` 等专用接口，不复用该接口

#### `POST /api/servers/:id/applications`

- 非成员可发起申请
- 已有 `pending` 返回 `409`
- `rejected` / `cancelled` 后重新发起时创建新申请

#### `PUT /api/servers/:id/applications/:appId`

- `OWNER` / `ADMIN` 可审批
- `approve` 前必须检查成员冲突
- 通过时创建成员与 add sync
- 拒绝时只更新申请状态和备注

#### `POST /api/servers/:id/join/:code`

- 必须校验 `joinMode`
- 同事务处理邀请加入和 pending 申请自动关闭
- 成功时创建成员与 add sync

#### `GET /api/servers/:id/members`

- 新增返回 `role`
- 支持 `role=all|admin|member`
- 同步状态使用最近有效 sync 计算

#### `DELETE /api/servers/:id/members/:memberId`

- 使用角色权限判断
- 删除前持久化 `remove` sync

### 新增接口

#### `POST /api/servers/:id/applications/:appId/cancel`

- 玩家取消自己的 `pending` 申请
- 状态改为 `cancelled`

#### `PATCH /api/servers/:id/members/:memberId`

- 仅 `OWNER` 可用
- 用于 `MEMBER <-> ADMIN` 角色切换
- 请求体仅允许 `role: ADMIN | MEMBER`
- 目标成员当前角色不得为 `OWNER`
- 不允许通过此接口变更自己

#### `DELETE /api/servers/:id/membership`

- 当前登录成员主动退服
- `OWNER` 不可用

### 权限放宽的接口

从 owner-only 改为 `OWNER | ADMIN`：

- `GET /api/servers/:id/invites`
- `POST /api/servers/:id/invites`
- `DELETE /api/servers/:id/invites/:code`
- `GET /api/servers/:id/sync/status`

仍保持 owner-only：

- `PUT /api/servers/:id/settings`
- `POST /api/servers/:id/api-key`

## 页面与交互设计

### 服务器详情页

详情页不再自己散查 `isMember + latestApplicationStatus`，而是消费统一 membership payload。

非 owner 私密状态卡片的单一动作规则：

- `MEMBER`: 显示“已加入”
- `ADMIN`: 显示“协管成员”
- `pending`: 显示“申请审核中”，主动作是“撤回申请”
- `rejected`: 显示“申请未通过”，提供“重新申请”
- `cancelled`: 显示“申请已撤回”，提供“重新申请”
- 无成员且允许申请: 显示“申请加入”
- 无成员且仅邀请: 显示“需要邀请码”
- 无成员且同时支持申请和邀请: 同时展示两种路径，但强调邀请码可直接加入

如果当前用户是 `ADMIN`，可显示轻量控制台入口，但不暴露 owner-only 设置项。

### 申请页

- 已是成员时直接显示成员态
- 有 `pending` 时显示申请状态和“撤回申请”
- `rejected` / `cancelled` 时显示上次结果摘要后允许重新申请
- 若当前服务器不接受申请，明确提示“当前仅支持邀请码加入”

### 邀请加入页

- 若当前用户已是成员，直接显示成员态，不再重复提交
- 若当前有 `pending` 申请，提示“邀请码加入后将自动关闭当前申请”
- 成功后显示“已加入白名单同步队列”或对应同步状态提示

### 控制台申请列表

- tab 扩展为 `pending / approved / rejected / cancelled`
- 每条申请可显示自动关闭原因
- 若该申请用户已通过其他方式加入，要显示派生状态提示
- `ADMIN` 同样可执行审批

### 控制台成员列表

- 显示角色 badge：`OWNER / ADMIN / MEMBER`
- `OWNER` 固定置顶，不显示移除按钮
- `OWNER` 可提升/降级协管
- `ADMIN` 不可改角色
- recent sync 使用 add/remove 历史记录展示，不依赖成员记录是否仍存在

### 控制台邀请码管理

- `ADMIN` 可访问
- 至少保留创建者、创建时间、使用次数、过期时间的可读展示

### 控制台设置页

- `ServerSettings` 继续只给 `OWNER`
- `ADMIN` 控制台隐藏私密策略设置和 API Key 模块，但保留申请、成员、邀请码、同步状态模块

该规则与权限模型一致：

- API Key 仅 `OWNER` 可查看和重置
- `ADMIN` 无 API Key 的页面入口、模块可见性与接口权限

## 这轮顺手补上的产品能力

- 玩家可撤回申请
- 玩家可主动退服
- owner 可提升/降级协管
- 邀请加入会自动关闭挂起申请
- 被移除和主动退服都会写 remove sync
- 页面会明确解释“同步中 / 已同步 / 同步失败”
- 审批冲突和邀请码冲突返回业务文案，不暴露底层错误

## 明确暂不做

- 细粒度协管权限模板
- 邀请码备注、批量邀请码、一次性邀请码批量生成
- 成员黑名单/禁止再次申请
- 更复杂的私密服务器通知中心
- 手动重推某条 sync 的控制台工具
- 更复杂的成员组织结构

## 并发与冲突处理

申请审批、邀请码加入、成员移除、主动退服存在同一用户并发竞争窗口，本次实现必须在规范层面要求串行化或清晰冲突返回。

要求：

- `approve` / `join by invite` / `remove member` / `leave membership` 都必须在数据库事务内完成
- 成员存在性检查必须放在事务内，不允许先查后写
- `ServerApplication` 使用 partial unique index 保证单个用户单服最多一条 `pending`
- `ServerMember` 继续依赖 `unique(serverId, userId)` 保证单成员唯一
- 对同一 `(serverId, userId)` 的 join/approve 冲突，优先依赖数据库唯一约束 + 显式业务冲突转换为 `409`
- 若实现中仅靠唯一约束仍不足以稳定表达冲突，可在事务内对目标申请或成员候选行加锁，例如 `SELECT ... FOR UPDATE`

必须补测试的并发场景：

- 同一用户同时“申请审批通过”和“邀请码加入”
- 同一用户同时“被移除”和“主动退服”
- 同一用户短时间内重复提交申请
- 同一邀请码接近用尽时的并发加入

## 历史数据保留与查询排序

- `ServerApplication` 本次不引入自动清理保留期，历史记录默认长期保留
- 最近申请的查询排序必须使用 `createdAt DESC, id DESC`
- 控制台申请列表仍使用分页
- 玩家端 membership 接口只取归一化所需的最近记录，不暴露完整历史分页

## Sync 状态说明

`WhitelistSync.source` 仅表示事件来源，不替代同步生命周期状态。

同步生命周期继续沿用现有状态：

- `pending`
- `pushed`
- `acked`
- `failed`

UI 上“同步中 / 已同步 / 同步失败”的文案来源于 `status`，不是 `source`。

## UI 实现约束

后续 implementation 阶段，私密服务器相关 UI 改造应优先交由 subagent 承担，并按 skill 约束执行。

要求：

- UI-heavy 任务优先派给 worker subagent
- 子代理在开始 UI 设计和实现前必须加载合适的设计 skill
- 首选 skill: `frontend-design`
- 若只是调布局和信息层级，可按需要组合 `arrange`、`clarify`、`normalize`
- 必须保持现有 Warm Clay Community UI 视觉体系，不另起新设计语言
- 不得为了“更设计化”破坏当前信息密度和控制台操作效率

## 测试与验收

至少覆盖以下场景：

- 重复提交 pending 申请返回 `409`
- `rejected` / `cancelled` 后可重新申请
- 邀请加入时会自动关闭 pending 申请
- 审批通过前若用户已是成员，返回业务冲突
- `ADMIN` 可审批、发邀请码、移除普通成员
- `ADMIN` 不能改设置、不能改角色、不能移除 `OWNER` / `ADMIN`
- 主动退服会生成 remove sync
- owner/admin 移除成员会生成 remove sync
- 删除成员后历史 sync 仍可查询
- 详情页对同一用户只出现一个主动作
- 申请页支持撤回申请
- 邀请页对已加入用户不再重复提交
- 控制台成员列表展示角色
- 控制台申请列表支持 `cancelled`

## 实施顺序建议

1. Prisma schema 与 migration
2. 权限服务层与 membership state helpers
3. 申请/邀请/成员相关 API 重构
4. sync 状态与 remove 记录链路修复
5. 控制台页面与详情页交互收口
6. 测试补齐与文档更新
