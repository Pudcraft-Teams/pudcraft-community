import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import 'post_detail_page.dart';
import 'servers_page.dart';
import 'widgets.dart';

class UserLibraryPage extends StatefulWidget {
  const UserLibraryPage({
    super.key,
    required this.repository,
    required this.uid,
  });

  final CommunityRepository repository;
  final int uid;

  @override
  State<UserLibraryPage> createState() => _UserLibraryPageState();
}

class _UserLibraryPageState extends State<UserLibraryPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  late Future<_UserLibraryBundle> _future;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _future = _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<_UserLibraryBundle> _load() async {
    final results = await Future.wait([
      widget.repository.fetchFavoriteServers(),
      widget.repository.fetchBookmarkedPosts(),
      widget.repository.fetchPublicUserProfile(widget.uid.toString()),
    ]);

    return _UserLibraryBundle(
      favorites: results[0] as List<ServerListItem>,
      bookmarks: results[1] as List<PostItem>,
      profile: results[2] as PublicUserProfile,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Library'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Favorites'),
            Tab(text: 'Bookmarks'),
            Tab(text: 'My Servers'),
          ],
        ),
      ),
      body: FutureBuilder<_UserLibraryBundle>(
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
          return TabBarView(
            controller: _tabController,
            children: [
              _ServerListView(
                servers: bundle.favorites,
                repository: widget.repository,
                emptyTitle: 'No favorites',
                emptyMessage: 'You have not favorited any servers yet.',
              ),
              _PostListView(
                posts: bundle.bookmarks,
                repository: widget.repository,
                emptyTitle: 'No bookmarks',
                emptyMessage: 'You have not bookmarked any posts yet.',
              ),
              _ServerListView(
                servers: bundle.profile.servers,
                repository: widget.repository,
                emptyTitle: 'No servers',
                emptyMessage: 'You have not published any servers yet.',
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ServerListView extends StatelessWidget {
  const _ServerListView({
    required this.servers,
    required this.repository,
    required this.emptyTitle,
    required this.emptyMessage,
  });

  final List<ServerListItem> servers;
  final CommunityRepository repository;
  final String emptyTitle;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    if (servers.isEmpty) {
      return EmptyView(title: emptyTitle, message: emptyMessage);
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: servers.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final server = servers[index];
        return Card(
          child: ListTile(
            title: Text(server.name),
            subtitle: Text(server.description ?? '${server.host}:${server.port}'),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (routeContext) => ServerDetailPage(
                    repository: repository,
                    serverId: server.id,
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _PostListView extends StatelessWidget {
  const _PostListView({
    required this.posts,
    required this.repository,
    required this.emptyTitle,
    required this.emptyMessage,
  });

  final List<PostItem> posts;
  final CommunityRepository repository;
  final String emptyTitle;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    if (posts.isEmpty) {
      return EmptyView(title: emptyTitle, message: emptyMessage);
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: posts.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final post = posts[index];
        return Card(
          child: ListTile(
            title: Text(post.title.isEmpty ? 'Untitled post' : post.title),
            subtitle: Text(
              post.contentPreview,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (routeContext) => PostDetailPage(
                    repository: repository,
                    postId: post.id,
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _UserLibraryBundle {
  const _UserLibraryBundle({
    required this.favorites,
    required this.bookmarks,
    required this.profile,
  });

  final List<ServerListItem> favorites;
  final List<PostItem> bookmarks;
  final PublicUserProfile profile;
}
