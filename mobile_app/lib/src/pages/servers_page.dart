import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/community_repository.dart';
import 'widgets.dart';

class ServersPage extends StatefulWidget {
  const ServersPage({super.key, required this.repository});

  final CommunityRepository repository;

  @override
  State<ServersPage> createState() => _ServersPageState();
}

class _ServersPageState extends State<ServersPage> {
  final _searchController = TextEditingController();
  late Future<ServerListResponse> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.fetchServers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _search() {
    setState(() {
      _future = widget.repository.fetchServers(search: _searchController.text);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    hintText: 'Search servers',
                    prefixIcon: Icon(Icons.travel_explore),
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
          child: FutureBuilder<ServerListResponse>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const LoadingView();
              }
              if (snapshot.hasError) {
                return ErrorView(
                  message: snapshot.error.toString(),
                  onRetry: _search,
                );
              }
              final servers = snapshot.data?.items ?? const <ServerListItem>[];
              if (servers.isEmpty) {
                return const EmptyView(
                  title: 'No servers',
                  message: 'No results matched your query.',
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                itemCount: servers.length,
                separatorBuilder: (context, index) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final server = servers[index];
                  return Card(
                    child: ListTile(
                      title: Text(server.name),
                      subtitle: Text(
                        server.description ?? '${server.host}:${server.port}',
                      ),
                      trailing: Chip(
                        label: Text(server.status.online ? 'Online' : 'Offline'),
                      ),
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (routeContext) => ServerDetailPage(
                              repository: widget.repository,
                              serverId: server.id,
                            ),
                          ),
                        );
                      },
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

class ServerDetailPage extends StatefulWidget {
  const ServerDetailPage({
    super.key,
    required this.repository,
    required this.serverId,
  });

  final CommunityRepository repository;
  final String serverId;

  @override
  State<ServerDetailPage> createState() => _ServerDetailPageState();
}

class _ServerDetailPageState extends State<ServerDetailPage> {
  ServerDetail? _server;
  bool _loading = true;
  bool _togglingFavorite = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final detail = await widget.repository.fetchServerDetail(widget.serverId);
      bool? favorited;
      try {
        favorited = await widget.repository.fetchServerFavoriteStatus(widget.serverId);
      } on ApiException {
        favorited = detail.isFavorited;
      }

      if (!mounted) {
        return;
      }
      setState(() {
        _server = detail.copyWith(isFavorited: favorited);
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

  Future<void> _toggleFavorite() async {
    final server = _server;
    if (server == null || _togglingFavorite) {
      return;
    }

    setState(() => _togglingFavorite = true);
    try {
      final result = await widget.repository.toggleServerFavorite(
        id: server.id,
        favorite: !(server.isFavorited ?? false),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _server = server.copyWith(
          isFavorited: result.active,
          favoriteCount: result.count ?? server.favoriteCount,
        );
      });
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } finally {
      if (mounted) {
        setState(() => _togglingFavorite = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: LoadingView());
    }

    if (_error != null || _server == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Server')),
        body: ErrorView(
          message: _error ?? 'Failed to load server.',
          onRetry: _load,
        ),
      );
    }

    final server = _server!;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Server'),
        actions: [
          IconButton(
            onPressed: _togglingFavorite ? null : _toggleFavorite,
            icon: Icon(
              (server.isFavorited ?? false)
                  ? Icons.favorite
                  : Icons.favorite_border,
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      server.name,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(server.description ?? 'No description yet.'),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        Chip(label: Text('${server.host}:${server.port}')),
                        Chip(label: Text(server.status.online ? 'Online' : 'Offline')),
                        if (server.favoriteCount != null)
                          Chip(label: Text('${server.favoriteCount} favorites')),
                        if (server.isVerified) const Chip(label: Text('Verified')),
                      ],
                    ),
                    const SizedBox(height: 12),
                    FilledButton.tonalIcon(
                      onPressed: _togglingFavorite ? null : _toggleFavorite,
                      icon: Icon(
                        (server.isFavorited ?? false)
                            ? Icons.favorite
                            : Icons.favorite_border,
                      ),
                      label: Text(
                        (server.isFavorited ?? false) ? 'Favorited' : 'Favorite',
                      ),
                    ),
                    if ((server.content ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      MarkdownBody(data: server.content!),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
