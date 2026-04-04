import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import 'create_post_page.dart';
import 'post_detail_page.dart';
import 'widgets.dart';

class CircleDetailPage extends StatefulWidget {
  const CircleDetailPage({
    super.key,
    required this.repository,
    required this.circleIdOrSlug,
  });

  final CommunityRepository repository;
  final String circleIdOrSlug;

  @override
  State<CircleDetailPage> createState() => _CircleDetailPageState();
}

class _CircleDetailPageState extends State<CircleDetailPage> {
  late Future<_CircleBundle> _future;
  CircleDetail? _currentDetail;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CircleBundle> _load() async {
    final detail = await widget.repository.fetchCircleDetail(widget.circleIdOrSlug);
    final feed = await widget.repository.fetchFeed(circleId: detail.id);
    return _CircleBundle(detail: detail, posts: feed.posts);
  }

  Future<void> _openComposer() async {
    final detail = _currentDetail;
    if (detail == null) {
      return;
    }

    final result = await Navigator.of(context).push<CreatedPostResult>(
      MaterialPageRoute(
        builder: (routeContext) => CreatePostPage(
          repository: widget.repository,
          circleId: detail.id,
          circleName: detail.name,
        ),
      ),
    );

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Circle'),
        actions: [
          if (_currentDetail != null)
            IconButton(
              onPressed: _openComposer,
              icon: const Icon(Icons.edit),
            ),
        ],
      ),
      body: FutureBuilder<_CircleBundle>(
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
          final bundle = snapshot.data!;
          _currentDetail = bundle.detail;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        bundle.detail.name,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      Text(bundle.detail.description ?? 'No description yet.'),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          Chip(label: Text('${bundle.detail.memberCount} members')),
                          Chip(label: Text('${bundle.detail.postCount} posts')),
                          if (bundle.detail.isMember == true)
                            Chip(label: Text(bundle.detail.memberRole ?? 'Joined')),
                          if (bundle.detail.serverName != null)
                            Chip(label: Text('Server: ${bundle.detail.serverName}')),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Posts',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (bundle.posts.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Text('No posts in this circle yet.'),
                  ),
                ),
              ...bundle.posts.map(
                (post) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: ListTile(
                      title: Text(post.title),
                      subtitle: Text(
                        post.contentPreview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: () {
                        Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => PostDetailPage(
                            repository: widget.repository,
                            postId: post.id,
                          ),
                        ));
                      },
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CircleBundle {
  const _CircleBundle({
    required this.detail,
    required this.posts,
  });

  final CircleDetail detail;
  final List<PostItem> posts;
}
