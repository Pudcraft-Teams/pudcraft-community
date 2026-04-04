import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/community_repository.dart';
import '../utils/time_format.dart';
import 'post_detail_page.dart';
import 'servers_page.dart';
import 'widgets.dart';

class InboxPage extends StatefulWidget {
  const InboxPage({
    super.key,
    required this.repository,
    required this.loggedIn,
    required this.onRequireLogin,
  });

  final CommunityRepository repository;
  final bool loggedIn;
  final VoidCallback onRequireLogin;

  @override
  State<InboxPage> createState() => _InboxPageState();
}

class _InboxPageState extends State<InboxPage> {
  Future<InboxResponse>? _future;
  bool _unreadOnly = false;

  @override
  void initState() {
    super.initState();
    _future = widget.loggedIn ? _load() : null;
  }

  @override
  void didUpdateWidget(covariant InboxPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.loggedIn != oldWidget.loggedIn) {
      _future = widget.loggedIn ? _load() : null;
    }
  }

  Future<InboxResponse> _load() {
    return widget.repository.fetchInbox(unreadOnly: _unreadOnly);
  }

  Future<void> _markRead() async {
    try {
      await widget.repository.markForumNotificationsRead();
      setState(() => _future = _load());
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  void _openDestination(InboxItem item) {
    final destination = item.destination;
    if (destination == null || destination.isEmpty) {
      return;
    }

    final postMatch = RegExp(r'/post/([^/]+)$').firstMatch(destination);
    if (postMatch != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (routeContext) => PostDetailPage(
            repository: widget.repository,
            postId: postMatch.group(1)!,
          ),
        ),
      );
      return;
    }

    final circlePostMatch = RegExp(r'/c/[^/]+/post/([^/]+)$').firstMatch(destination);
    if (circlePostMatch != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (routeContext) => PostDetailPage(
            repository: widget.repository,
            postId: circlePostMatch.group(1)!,
          ),
        ),
      );
      return;
    }

    final serverMatch = RegExp(r'/servers/([^/]+)$').firstMatch(destination);
    if (serverMatch != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (routeContext) => ServerDetailPage(
            repository: widget.repository,
            serverId: serverMatch.group(1)!,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.loggedIn) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('登录后才能查看移动通知箱。'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: widget.onRequireLogin,
                child: const Text('去登录'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              FilterChip(
                selected: _unreadOnly,
                label: const Text('仅未读'),
                onSelected: (selected) {
                  setState(() {
                    _unreadOnly = selected;
                    _future = _load();
                  });
                },
              ),
              const Spacer(),
              TextButton(
                onPressed: _markRead,
                child: const Text('标记论坛已读'),
              ),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<InboxResponse>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const LoadingView();
              }
              if (snapshot.hasError) {
                return ErrorView(
                  message: snapshot.error.toString(),
                  onRetry: () => setState(() => _future = _load()),
                );
              }
              final items = snapshot.data?.notifications ?? const <InboxItem>[];
              if (items.isEmpty) {
                return const EmptyView(title: '通知为空', message: '当前没有可展示的通知。');
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                itemCount: items.length,
                separatorBuilder: (context, index) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return Card(
                    color: item.read ? null : const Color(0xFFFFF3E8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(24),
                      onTap: item.destination == null ? null : () => _openDestination(item),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Chip(label: Text(item.kind == 'forum' ? 'Forum' : 'Site')),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    item.title,
                                    style: Theme.of(context).textTheme.titleSmall,
                                  ),
                                ),
                                if (item.destination != null)
                                  const Icon(Icons.chevron_right),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(item.body),
                            const SizedBox(height: 8),
                            Text(
                              formatDateTime(item.createdAt),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
