# Pudcraft Mobile

这是为 `pudcraft-community` 配套补的 Flutter 客户端骨架，直接复用现有站点 API，不重写后端。

## 当前实现

- 邮箱密码登录，复用 `/api/mobile/session/login`
- 会话保持与退出登录
- 广场帖子流
- 帖子详情与评论列表
- 服务器目录与服务器详情
- 圈子列表与圈子详情
- 统一通知箱，复用 `/api/mobile/inbox`
- 搜索页，复用 `/api/search`

## 本机运行前提

当前机器没有安装 Flutter，所以这里只提交了应用源码，没有生成 `android/` 和 `ios/` 原生壳目录。

你在装好 Flutter 后，在 `mobile_app` 目录执行：

```bash
flutter create --platforms android,ios .
flutter pub get
flutter run --dart-define=API_BASE_URL=http://你的服务端地址
```

如果 Android 模拟器访问本机 Next.js，常用地址是：

```text
http://10.0.2.2:3000
```

真机调试时，把 `API_BASE_URL` 改成局域网可访问地址。

## 已知限制

- 还没有实现发帖、发评论、收藏、点赞、圈子管理、服务台管理后台
- 搜索页先以帖子结果为主，`@用户` 搜索只显示用户结果，不跳个人主页
- UI 已按手机端信息架构重新组织，但还没做平台级细节打磨

