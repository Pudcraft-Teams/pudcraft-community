import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import 'post_detail_page.dart';
import 'public_user_page.dart';
import 'widgets.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key, required this.repository});

  final CommunityRepository repository;

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final _controller = TextEditingController();
  Future<SearchResult>? _future;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _search() {
    final query = _controller.text.trim();
    if (query.isEmpty) {
      return;
    }
    setState(() {
      _future = widget.repository.search(query);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    autofocus: true,
                    decoration: const InputDecoration(
                      hintText: 'Search posts, #tags, @users',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onSubmitted: (value) => _search(),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  onPressed: _search,
                  child: const Text('Search'),
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<SearchResult>(
              future: _future,
              builder: (context, snapshot) {
                if (_future == null) {
                  return const EmptyView(
                    title: 'Start searching',
                    message: 'Use keywords, #tags, or @users.',
                  );
                }
                if (snapshot.connectionState != ConnectionState.done) {
                  return const LoadingView();
                }
                if (snapshot.hasError) {
                  return ErrorView(
                    message: snapshot.error.toString(),
                    onRetry: _search,
                  );
                }
                final result = snapshot.data!;
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    if (result.tagDisplayName != null) ...[
                      Chip(label: Text('#${result.tagDisplayName}')),
                      const SizedBox(height: 12),
                    ],
                    if (result.users.isNotEmpty) ...[
                      Text(
                        'Users',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      ...result.users.map(
                        (user) => Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              child: Text('${user.uid}'),
                            ),
                            title: Text(user.name ?? 'Unnamed user'),
                            subtitle: Text('@${user.uid}'),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (routeContext) => PublicUserPage(
                                    repository: widget.repository,
                                    lookupId: user.uid.toString(),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (result.posts.isNotEmpty) ...[
                      Text(
                        'Posts',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      ...result.posts.map(
                        (post) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Card(
                            child: ListTile(
                              title: Text(
                                post.title.isEmpty ? 'Untitled post' : post.title,
                              ),
                              subtitle: Text(
                                post.contentPreview,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () {
                                Navigator.of(context).push(MaterialPageRoute(
                                  builder: (routeContext) => PostDetailPage(
                                    repository: widget.repository,
                                    postId: post.id,
                                  ),
                                ));
                              },
                            ),
                          ),
                        ),
                      ),
                    ] else if (result.users.isEmpty) ...[
                      const EmptyView(
                        title: 'No results',
                        message: 'Try a different query.',
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
