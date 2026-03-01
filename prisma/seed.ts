import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedServer {
  name: string;
  host: string;
  port: number;
  description: string;
  content: string;
  tags: string[];
  status: {
    online: boolean;
    playerCount: number | null;
    maxPlayers: number | null;
    motd: string | null;
    latencyMs: number | null;
  };
}

const SEED_SERVERS: SeedServer[] = [
  {
    name: "Pudcraft 生存服",
    host: "play.pudcraft.cn",
    port: 25565,
    description:
      "纯净生存服务器，和平友好的社区环境，欢迎新人加入！支持领地保护和基础经济系统。",
    content: `## 服务器简介

Pudcraft 生存服定位为长期运营的原版生存社区，核心目标是让玩家在稳定、不重置的地图上慢慢建设自己的据点和公共工程。我们更看重社区氛围而不是短期冲榜，欢迎新手和休闲玩家常驻。

## 服务器规则

禁止任何形式的作弊客户端、矿透和自动脚本；禁止恶意破坏他人建筑、恶意引怪和刷屏辱骂。公共区域遵循先到先建和文明协商原则，管理员会保留完整日志并处理申诉。

## 玩法特色

服务器提供基础领地保护、简易经济和玩家商店，保留原版生存节奏，同时加入每周社区活动（集体远征、建筑评选、节日任务）。主世界长期保留，资源世界按季度刷新，兼顾老玩家资产与新玩家资源获取。

## 开服时间

首次开服时间为 2024 年 3 月 16 日，当前为全年长期运营模式。固定维护窗口为每周二 04:00-05:00（UTC+8），维护公告会提前在群内发布。

## 加入方式

服务器地址：play.pudcraft.cn（默认端口 25565）。
QQ 群：7284 39120（入群备注"Pudcraft 新人"）。`,
    tags: ["生存", "原版", "1.21"],
    status: {
      online: true,
      playerCount: 42,
      maxPlayers: 100,
      motd: "§a欢迎来到 Pudcraft 生存服！§r\n§7纯净生存 | 和平友好",
      latencyMs: 15,
    },
  },
  {
    name: "红石科技服",
    host: "redstone.example.cn",
    port: 25565,
    description:
      "专注红石与科技模组的技术向服务器，适合喜欢自动化和工业的玩家。",
    content: `## 服务器简介

红石科技服面向热爱自动化与工业体系的玩家，主打技术交流、工程协作和大型工厂建设。地图规划明确，公共交通和工业区独立分区，适合组队做长期项目。

## 服务器规则

禁止使用会造成服务器异常负载的无限时钟与无上限实体堆叠；大型机器上线前需先在测试区压测。公共线路和共享仓储禁止私改，任何技术争议以管理组性能规范为准。

## 玩法特色

服务器开放常用科技模组联动，支持多阶段工厂目标（发电、矿处理、物流总线、自动仓储）。每月举行一次"自动化挑战赛"，给出统一资源包和目标产线，按效率与稳定性评分。

## 开服时间

首次开服时间为 2023 年 11 月 5 日，重大版本更新通常在上游模组稳定后 2-3 周进行。例行维护在每周四 02:30（UTC+8）开始，预计 30 分钟。

## 加入方式

服务器地址：redstone.example.cn（默认端口 25565）。
QQ 群：6159 44087（入群需简短自我介绍）。`,
    tags: ["科技", "模组", "1.20.4", "Forge"],
    status: {
      online: true,
      playerCount: 18,
      maxPlayers: 50,
      motd: "§6红石科技服 §7| §e自动化的乐园",
      latencyMs: 32,
    },
  },
  {
    name: "像素大陆 RPG",
    host: "rpg.pixelland.cn",
    port: 25566,
    description:
      "大型 RPG 服务器，拥有完整的任务线、副本和交易系统，上百个自定义怪物等你挑战。",
    content: `## 服务器简介

像素大陆 RPG 是剧情驱动的多人冒险服务器，包含主线章节、地区声望与职业成长系统。玩家会从新手村出发，逐步解锁副本、世界事件和高难挑战内容。

## 服务器规则

禁止利用地形卡怪、恶意抢首领归属和跨区刷屏交易。副本组队需遵守队长分配规则，装备与掉落纠纷可提交战斗日志给客服组处理，严禁线下现金交易账号或道具。

## 玩法特色

提供战士、游侠、术士三大基础职业与后续转职，含技能树、符文搭配和套装词条。副本采用周常进度制，另有世界 Boss、公会远征、拍卖行与生活职业，适合长期养成。

## 开服时间

首次开服时间为 2024 年 1 月 20 日，当前版本 2.0 于 2025 年 10 月完成重制上线。每周一 06:00（UTC+8）刷新副本进度与赛季任务。

## 加入方式

服务器地址：rpg.pixelland.cn:25566。
QQ 群：9032 11876（入群可领取新手礼包码）。`,
    tags: ["RPG", "冒险", "1.20.4", "Spigot"],
    status: {
      online: true,
      playerCount: 156,
      maxPlayers: 200,
      motd: "§d像素大陆 RPG §7| §a新版本 2.0 已上线！",
      latencyMs: 48,
    },
  },
  {
    name: "创意工坊",
    host: "creative.mcbuilders.cn",
    port: 25565,
    description:
      "自由创造，展示你的建筑才华！定期举办建筑比赛，奖品丰厚。",
    content: `## 服务器简介

创意工坊是面向建筑爱好者的纯创造服务器，提供大地图地块、作品存档和团队协作工具。无论你偏好现代都市、古风城镇还是奇幻场景，都可以在这里稳定创作和展示。

## 服务器规则

禁止在他人地块未经许可复制、移动或破坏作品；禁止上传含攻击性内容的像素画或标语。公共展区投稿需遵守命名规范和题材分级，管理组保留首页推荐与下架权。

## 玩法特色

支持 WorldEdit 基础命令、地块快照回滚和作品时间线浏览。每月举办主题建筑赛，提供评委点评和社区投票双轨排名，优秀作品会进入"年度画册"并在官网展示。

## 开服时间

首次开服时间为 2022 年 8 月 13 日，迄今保持低频重置策略，仅在重大地形优化时对新分区开放。每周六 21:00（UTC+8）固定进行作品巡礼直播。

## 加入方式

服务器地址：creative.mcbuilders.cn（默认端口 25565）。
QQ 群：7410 55261（入群发送"建筑方向"可分配导师）。`,
    tags: ["创造", "建筑", "1.21"],
    status: {
      online: false,
      playerCount: null,
      maxPlayers: null,
      motd: null,
      latencyMs: null,
    },
  },
  {
    name: "空岛生存",
    host: "skyblock.mc.cn",
    port: 25565,
    description:
      "经典空岛生存玩法，支持多人协作岛屿，独创的岛屿评分排行榜。",
    content: `## 服务器简介

空岛生存以"从一棵树开始"的经典开荒体验为核心，强调资源管理、多人协作和中长期目标。你可以独自经营，也可以和好友共建岛屿，逐步发展出自动化与交易体系。

## 服务器规则

禁止利用漏洞复制物品、恶意卡交易和跨岛骚扰。合作岛屿成员变更需全员确认，涉及仓库与权限纠纷时以服务器操作日志为最终依据，违规账号将进行阶梯封禁。

## 玩法特色

包含岛屿任务线、访客评分、拍卖行和每周挑战副本。独创"岛屿评分排行榜"会综合建筑美观度、任务完成度与经济活跃度，赛季末发放称号、粒子和纪念装饰。

## 开服时间

首次开服时间为 2024 年 5 月 2 日，赛季周期为 12 周，赛季切换时保留荣誉档案并开放新区。每周五 18:00（UTC+8）更新挑战任务与限时活动。

## 加入方式

服务器地址：skyblock.mc.cn（默认端口 25565）。
QQ 群：8567 90314（入群后机器人自动发放新手指引）。`,
    tags: ["空岛", "生存", "1.20.4"],
    status: {
      online: true,
      playerCount: 73,
      maxPlayers: 150,
      motd: "§b空岛生存 §7| §f挑战极限生存",
      latencyMs: 22,
    },
  },
  {
    name: "PVP 竞技场",
    host: "pvp.battlemc.cn",
    port: 25567,
    description:
      "多种 PVP 模式：单挑、团战、饥饿游戏。S3 赛季火热进行中！",
    content: `## 服务器简介

PVP 竞技场聚焦高节奏对抗，提供排位、娱乐与赛事三条玩法线。无论你是 1v1 操作党，还是偏好大规模团队配合，都能在这里找到对应模式和稳定匹配环境。

## 服务器规则

严禁使用连点器、透视和任何非官方客户端增强；排位模式禁止恶意送分和代打。语音与文字频道执行"零辱骂"规则，违规行为将按警告、禁赛、封禁三级处理。

## 玩法特色

服务器支持单挑天梯、4v4 团战、饥饿游戏与限时乱斗模式，采用赛季积分结算。配套有战绩面板、回放系统和训练场，玩家可复盘连招节奏与走位选择，持续提升实战水平。

## 开服时间

首次开服时间为 2023 年 6 月 30 日，当前 S3 赛季已于 2025 年 12 月 1 日开启。每周三 20:00（UTC+8）进行平衡性微调并发布版本公告。

## 加入方式

服务器地址：pvp.battlemc.cn:25567。
QQ 群：6695 22408（入群绑定游戏名可同步段位身份组）。`,
    tags: ["PVP", "竞技", "1.20.4", "Paper"],
    status: {
      online: true,
      playerCount: 89,
      maxPlayers: 200,
      motd: "§c⚔ PVP 竞技场 §7| §e赛季 S3 火热进行中",
      latencyMs: 11,
    },
  },
  {
    name: "匠魂工艺",
    host: "tinker.craftworld.cn",
    port: 25565,
    description:
      "以匠魂模组为核心的冶炼冒险服务器，打造专属武器装备，挑战高难度 Boss。",
    content: `## 服务器简介

匠魂工艺围绕 Tinkers' Construct 模组展开，玩家需要从采矿、冶炼到锻造一步步提升装备等级。服务器配合其他辅助模组构建了完整的冒险 + 工艺循环。

## 服务器规则

禁止利用模组 Bug 复制物品或绕过进度系统；PVP 仅限指定竞技区域，野外默认和平模式。公会领地受保护，未经授权进入他人矿脉将被警告。

## 玩法特色

提供自定义矿脉分布、阶梯式 Boss 挑战和公会锻造排行榜。独特的"大师锻造"系统允许玩家为武器注入属性词条，每件装备都是独一无二的作品。

## 开服时间

首次开服时间为 2024 年 6 月 15 日。每周日 03:00（UTC+8）进行例行维护，版本更新提前 48 小时在群内公告。

## 加入方式

服务器地址：tinker.craftworld.cn（默认端口 25565）。
QQ 群：5523 67891（入群获取整合包下载链接）。`,
    tags: ["模组", "冒险", "1.20.1", "Forge"],
    status: {
      online: true,
      playerCount: 35,
      maxPlayers: 80,
      motd: "§6匠魂工艺 §7| §e锻造你的传说武器",
      latencyMs: 28,
    },
  },
  {
    name: "Fabric 轻量生存",
    host: "fabric.litemc.cn",
    port: 25565,
    description:
      "基于 Fabric 的轻量级模组生存服，优化流畅，适合中低配玩家。",
    content: `## 服务器简介

Fabric 轻量生存追求接近原版的游戏体验，同时通过精选的 Fabric 模组提升画质与便利性。服务器对性能做了深度优化，即使中低配电脑也能流畅游玩。

## 服务器规则

禁止使用影响公平性的客户端模组（如小地图透视、自动挖矿）。允许使用优化类模组（光影、Sodium 等）。建筑保护通过领地系统实现，新人默认获得一块初始领地。

## 玩法特色

配置了 Lithium、Starlight 等优化模组确保服务器 TPS 稳定在 20。游戏内容保持原版节奏，额外添加了睡觉投票、死亡坐标提示、自定义合成配方等便利功能。

## 开服时间

首次开服时间为 2025 年 1 月 8 日。每周三 05:00（UTC+8）进行例行维护。

## 加入方式

服务器地址：fabric.litemc.cn（默认端口 25565）。
QQ 群：4412 89563（入群获取推荐客户端模组列表）。`,
    tags: ["生存", "原版", "1.21", "Fabric"],
    status: {
      online: true,
      playerCount: 27,
      maxPlayers: 60,
      motd: "§aFabric 轻量生存 §7| §f流畅原版体验",
      latencyMs: 19,
    },
  },
  {
    name: "小游戏乐园",
    host: "minigame.funcraft.cn",
    port: 25568,
    description:
      "集合起床战争、密室逃脱、建筑大师等热门小游戏，随时开局，快速匹配。",
    content: `## 服务器简介

小游戏乐园汇集了多种经典和创新小游戏模式，玩家可以随时加入匹配，无需长期投入即可获得乐趣。适合休闲娱乐和朋友聚会。

## 服务器规则

禁止在游戏中使用外挂和利用 Bug 获取不正当优势；禁止恶意退出影响其他玩家体验。多次违规将被暂时禁止匹配。聊天频道禁止人身攻击和刷屏。

## 玩法特色

目前开放起床战争、密室逃脱、建筑大师、TNT Run、弓箭对决五大模式。每周轮换一个限时模式，节假日推出特别主题活动。积分系统跨模式通用，可兑换皮肤和特效。

## 开服时间

首次开服时间为 2024 年 9 月 1 日。服务器 24 小时运行，每日 06:00（UTC+8）自动重启维护。

## 加入方式

服务器地址：minigame.funcraft.cn:25568。
QQ 群：7789 45612（入群参与内测资格抽奖）。`,
    tags: ["小游戏", "PVP", "1.20.4", "Paper"],
    status: {
      online: true,
      playerCount: 112,
      maxPlayers: 300,
      motd: "§e小游戏乐园 §7| §a5 种模式等你来战！",
      latencyMs: 35,
    },
  },
  {
    name: "养老和平服",
    host: "peace.oldcraft.cn",
    port: 25565,
    description:
      "纯和平模式生存，没有怪物没有 PVP，适合喜欢安静建造和种田的玩家。",
    content: `## 服务器简介

养老和平服专为喜欢慢节奏游戏的玩家设计，地图和平模式全天开启，没有怪物生成也没有 PVP。玩家可以专注于建造、种植、钓鱼和社交。

## 服务器规则

本服以和谐为第一原则：禁止任何形式的骚扰、恶意破坏和负面言论。公共建筑区域采用投票制管理，所有重大决策由社区成员共同讨论。

## 玩法特色

提供扩展的农业系统（更多作物种类和烹饪配方）、家具装饰插件和宠物系统。每月举办"最美庄园"评选，获奖者作品会在出生点大厅展示。

## 开服时间

首次开服时间为 2023 年 3 月 20 日，地图从未重置。每周一 04:00（UTC+8）进行备份维护。

## 加入方式

服务器地址：peace.oldcraft.cn（默认端口 25565）。
QQ 群：3345 67890（入群年龄不限，欢迎各年龄段玩家）。`,
    tags: ["生存", "养老", "1.21"],
    status: {
      online: true,
      playerCount: 15,
      maxPlayers: 40,
      motd: "§7养老和平服 §7| §a安静建造，享受生活",
      latencyMs: 12,
    },
  },
  {
    name: "跑酷竞速",
    host: "parkour.speedmc.cn",
    port: 25570,
    description:
      "专业跑酷服务器，数百张精心设计的地图，全球排行榜实时竞争。",
    content: `## 服务器简介

跑酷竞速是一个专注于跑酷玩法的竞技服务器，拥有从新手到地狱难度的数百张手工地图。每张地图都有精确到毫秒的计时系统和全服排行榜。

## 服务器规则

禁止使用任何移动增强类模组（自动跳跃、速度修改等）。排行榜成绩需通过反作弊系统验证，可疑成绩将被人工审核。友善对待新手，禁止嘲讽和人身攻击。

## 玩法特色

地图分为"入门"、"进阶"、"大师"、"地狱"四个难度等级。提供练习模式（无限检查点）和竞速模式（最少检查点）。每周发布新地图，月末举办竞速锦标赛。

## 开服时间

首次开服时间为 2024 年 2 月 14 日。服务器 24 小时运行，每周四 05:00（UTC+8）进行地图更新维护。

## 加入方式

服务器地址：parkour.speedmc.cn:25570。
QQ 群：8890 12345（入群可获取跑酷教学视频合集）。`,
    tags: ["跑酷", "竞技", "1.20.4"],
    status: {
      online: true,
      playerCount: 45,
      maxPlayers: 100,
      motd: "§b跑酷竞速 §7| §e挑战你的极限！",
      latencyMs: 18,
    },
  },
  {
    name: "基岩互通服",
    host: "bedrock.crossplay.cn",
    port: 19132,
    description:
      "Java 版和基岩版互通服务器，手机电脑都能玩，和朋友一起跨平台冒险。",
    content: `## 服务器简介

基岩互通服通过 Geyser 实现 Java 版与基岩版的跨平台互通。无论你使用电脑、手机还是主机，都可以在同一个世界中与朋友一起游戏。

## 服务器规则

跨平台互通可能存在少量表现差异，请互相理解。禁止利用平台差异获取不公平优势。基岩版玩家如遇显示异常请及时反馈，管理组会尽快修复。

## 玩法特色

支持 Java 和基岩版玩家同服游玩，自动处理协议转换。提供统一的经济系统、领地保护和社区活动。定期举办跨平台建造比赛和合作探险活动。

## 开服时间

首次开服时间为 2024 年 11 月 1 日。每周二和周五 05:00（UTC+8）进行例行维护和 Geyser 版本同步。

## 加入方式

Java 版地址：bedrock.crossplay.cn:25565
基岩版地址：bedrock.crossplay.cn:19132
QQ 群：2234 56789（入群注明平台类型以获取对应指引）。`,
    tags: ["生存", "基岩版", "1.21"],
    status: {
      online: true,
      playerCount: 58,
      maxPlayers: 120,
      motd: "§a基岩互通服 §7| §fJava + 基岩 一起玩！",
      latencyMs: 40,
    },
  },
];

async function main() {
  console.log("Seeding database...");

  // Clear existing data to allow re-running seed
  await prisma.serverStatus.deleteMany();
  await prisma.server.deleteMany();

  for (const serverData of SEED_SERVERS) {
    const { status, ...serverFields } = serverData;
    const server = await prisma.server.create({
      data: {
        ...serverFields,
        statuses: {
          create: {
            online: status.online,
            playerCount: status.playerCount,
            maxPlayers: status.maxPlayers,
            motd: status.motd,
            favicon: null,
          },
        },
      },
    });
    console.log(`  Created: ${server.name} (${server.id})`);
  }

  const count = await prisma.server.count();
  console.log(`\nSeeding complete. ${count} servers created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
