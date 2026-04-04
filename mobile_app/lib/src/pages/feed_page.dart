import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import '../utils/time_format.dart';
import 'create_post_page.dart';
import 'post_detail_page.dart';
import 'widgets.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key, required this.repository});

  final CommunityRepository repository;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  final List<PostItem> _posts = <PostItem>[];
  bool _loading = true;
  bool _loadingMore = false;
  String? _nextCursor;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadInitial();
  }

  Future<void> _loadInitial() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.repository.fetchFeed();
      if (!mounted) {
        return;
      }
      setState(() {
        _posts
          ..clear()
          ..addAll(response.posts);
        _nextCursor = response.nextCursor;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _error = error.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _nextCursor == null) {
      return;
    }

    setState(() => _loadingMore = true);
    try {
      final response = await widget.repository.fetchFeed(cursor: _nextCursor);
      if (!mounted) {
        return;
      }
      setState(() {
        _posts.addAll(response.posts);
        _nextCursor = response.nextCursor;
      });
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  Future<void> _openComposer() async {
    final result = await Navigator.of(context).push<CreatedPostResult>(
      MaterialPageRoute(
        builder: (routeContext) => CreatePostPage(
          repository: widget.repository,
        ),
      ),
    );

    if (!mounted || result == null) {
      return;
    }

    await _loadInitial();

    if (!mounted) {
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (routeContext) => PostDetailPage(
          repository: widget.repository,
          postId: result.id,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(
                  message: _error!,
                  onRetry: _loadInitial,
                )
              : _posts.isEmpty
                  ? const EmptyView(
                      title: 'No posts',
                      message: 'The square is still empty.',
                    )
                  : RefreshIndicator(
                      onRefresh: _loadInitial,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                        itemCount: _posts.length + 1,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          if (index == _posts.length) {
                            if (_nextCursor == null) {
                              return const SizedBox.shrink();
                            }
                            return Center(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 4, bottom: 12),
                                child: OutlinedButton(
                                  onPressed: _loadingMore ? null : _loadMore,
                                  child: Text(
                                    _loadingMore ? 'Loading...' : 'Load More',
                                  ),
                                ),
                              ),
                            );
                          }

                          final post = _posts[index];
                          return Card(
                            child: InkWell(
                              borderRadius: BorderRadius.circular(24),
                              onTap: () {
                                Navigator.of(context).push(MaterialPageRoute(
                                  builder: (routeContext) => PostDetailPage(
                                    repository: widget.repository,
                                    postId: post.id,
                                  ),
                                ));
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(18),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            post.title.isEmpty
                                                ? 'Untitled post'
                                                : post.title,
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleMedium,
                                          ),
                                        ),
                                        if (post.isPinned)
                                          const Chip(label: Text('Pinned')),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      post.contentPreview,
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 12),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        if (post.circle != null)
                                          Chip(label: Text(post.circle!.name)),
                                        if (post.section != null)
                                          Chip(label: Text(post.section!.name)),
                                        Chip(
                                            label: Text(
                                                '${post.commentCount} comments')),
                                        Chip(
                                            label:
                                                Text('${post.likeCount} likes')),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    Text(
                                      '${post.author.name ?? 'Unknown user'} · ${formatDateTime(post.createdAt)}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openComposer,
        icon: const Icon(Icons.edit),
        label: const Text('Post'),
      ),
    );
  }
}
