import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/community_repository.dart';
import '../utils/time_format.dart';
import 'widgets.dart';

class PostDetailPage extends StatefulWidget {
  const PostDetailPage({
    super.key,
    required this.repository,
    required this.postId,
  });

  final CommunityRepository repository;
  final String postId;

  @override
  State<PostDetailPage> createState() => _PostDetailPageState();
}

class _PostDetailPageState extends State<PostDetailPage> {
  final _commentController = TextEditingController();
  ForumComment? _replyTarget;
  PostDetail? _detail;
  List<ForumComment> _comments = const [];
  bool _loading = true;
  bool _togglingLike = false;
  bool _togglingBookmark = false;
  bool _submittingComment = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final detail = await widget.repository.fetchPostDetail(widget.postId);
      final comments = await widget.repository.fetchPostComments(widget.postId);
      if (!mounted) {
        return;
      }
      setState(() {
        _detail = detail;
        _comments = comments;
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

  Future<void> _togglePostLike() async {
    final detail = _detail;
    if (detail == null || _togglingLike) {
      return;
    }

    setState(() => _togglingLike = true);
    try {
      final result = await widget.repository.togglePostLike(
        postId: detail.id,
        like: !(detail.isLiked ?? false),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _detail = detail.copyWith(
          isLiked: result.active,
          likeCount: result.count ?? detail.likeCount,
        );
      });
    } on ApiException catch (error) {
      _showSnack(error.message);
    } finally {
      if (mounted) {
        setState(() => _togglingLike = false);
      }
    }
  }

  Future<void> _toggleBookmark() async {
    final detail = _detail;
    if (detail == null || _togglingBookmark) {
      return;
    }

    setState(() => _togglingBookmark = true);
    try {
      final result = await widget.repository.togglePostBookmark(
        postId: detail.id,
        bookmark: !(detail.isBookmarked ?? false),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _detail = detail.copyWith(isBookmarked: result.active);
      });
    } on ApiException catch (error) {
      _showSnack(error.message);
    } finally {
      if (mounted) {
        setState(() => _togglingBookmark = false);
      }
    }
  }

  Future<void> _submitComment() async {
    final content = _commentController.text.trim();
    final detail = _detail;
    if (detail == null || content.isEmpty || _submittingComment) {
      return;
    }

    setState(() => _submittingComment = true);
    try {
      final result = await widget.repository.createComment(
        postId: detail.id,
        content: content,
        parentCommentId: _replyTarget?.id,
      );
      if (!mounted) {
        return;
      }
      _commentController.clear();
      setState(() {
        _comments = [result.comment, ..._comments];
        _detail = detail.copyWith(commentCount: detail.commentCount + 1);
        _replyTarget = null;
      });
    } on ApiException catch (error) {
      _showSnack(error.message);
    } finally {
      if (mounted) {
        setState(() => _submittingComment = false);
      }
    }
  }

  void _startReply(ForumComment comment) {
    setState(() {
      _replyTarget = comment;
    });
  }

  void _cancelReply() {
    setState(() {
      _replyTarget = null;
    });
  }

  Future<void> _toggleCommentLike(ForumComment comment) async {
    try {
      final result = await widget.repository.toggleCommentLike(
        commentId: comment.id,
        like: !(comment.isLiked ?? false),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _comments = _comments.map((item) {
          if (item.id != comment.id) {
            return item;
          }
          return item.copyWith(
            isLiked: result.active,
            likeCount: result.count ?? item.likeCount,
          );
        }).toList();
      });
    } on ApiException catch (error) {
      _showSnack(error.message);
    }
  }

  void _showSnack(String message) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: LoadingView());
    }

    if (_error != null || _detail == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Post')),
        body: ErrorView(
          message: _error ?? 'Failed to load post.',
          onRetry: _load,
        ),
      );
    }

    final detail = _detail!;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Post'),
        actions: [
          IconButton(
            onPressed: _togglingBookmark ? null : _toggleBookmark,
            icon: Icon(
              (detail.isBookmarked ?? false)
                  ? Icons.bookmark
                  : Icons.bookmark_outline,
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      detail.title.isEmpty ? 'Untitled post' : detail.title,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${detail.author.name ?? 'Unknown user'} · ${formatDateTime(detail.createdAt)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (detail.circle != null)
                          Chip(label: Text(detail.circle!.name)),
                        Chip(label: Text('${detail.viewCount} views')),
                        Chip(label: Text('${detail.likeCount} likes')),
                        Chip(label: Text('${detail.commentCount} comments')),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        FilledButton.tonalIcon(
                          onPressed: _togglingLike ? null : _togglePostLike,
                          icon: Icon(
                            (detail.isLiked ?? false)
                                ? Icons.thumb_up
                                : Icons.thumb_up_outlined,
                          ),
                          label: Text(
                            (detail.isLiked ?? false) ? 'Liked' : 'Like',
                          ),
                        ),
                        const SizedBox(width: 12),
                        OutlinedButton.icon(
                          onPressed: _togglingBookmark ? null : _toggleBookmark,
                          icon: Icon(
                            (detail.isBookmarked ?? false)
                                ? Icons.bookmark
                                : Icons.bookmark_outline,
                          ),
                          label: Text(
                            (detail.isBookmarked ?? false)
                                ? 'Bookmarked'
                                : 'Bookmark',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    MarkdownBody(data: detail.content),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Add a comment',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (_replyTarget != null) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Replying to ${_replyTarget!.author.name ?? 'unknown user'}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                          TextButton(
                            onPressed: _cancelReply,
                            child: const Text('Cancel'),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: _commentController,
                      minLines: 3,
                      maxLines: 6,
                      decoration: const InputDecoration(
                        hintText: 'Write something useful.',
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _submittingComment ? null : _submitComment,
                      child: Text(
                        _submittingComment ? 'Posting...' : 'Post Comment',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Comments ${_comments.length}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (_comments.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(18),
                  child: Text('No comments yet.'),
                ),
              ),
            ..._comments.map(
              (comment) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          comment.author.name ?? 'Unknown user',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 4),
                        if (comment.parentAuthorName != null)
                          Text(
                            'Reply to ${comment.parentAuthorName}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        const SizedBox(height: 8),
                        Text(comment.content),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Text(
                              formatDateTime(comment.createdAt),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const Spacer(),
                            TextButton(
                              onPressed: () => _startReply(comment),
                              child: const Text('Reply'),
                            ),
                            TextButton.icon(
                              onPressed: () => _toggleCommentLike(comment),
                              icon: Icon(
                                (comment.isLiked ?? false)
                                    ? Icons.favorite
                                    : Icons.favorite_border,
                                size: 18,
                              ),
                              label: Text('${comment.likeCount}'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
