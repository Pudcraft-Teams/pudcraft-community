import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import 'servers_page.dart';
import 'widgets.dart';

class PublicUserPage extends StatefulWidget {
  const PublicUserPage({
    super.key,
    required this.repository,
    required this.lookupId,
  });

  final CommunityRepository repository;
  final String lookupId;

  @override
  State<PublicUserPage> createState() => _PublicUserPageState();
}

class _PublicUserPageState extends State<PublicUserPage> {
  late Future<PublicUserProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.fetchPublicUserProfile(widget.lookupId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('User')),
      body: FutureBuilder<PublicUserProfile>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingView();
          }
          if (snapshot.hasError) {
            return ErrorView(
              message: snapshot.error.toString(),
              onRetry: () => setState(() {
                _future = widget.repository.fetchPublicUserProfile(widget.lookupId);
              }),
            );
          }

          final profile = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.name ?? 'Unnamed user',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      Text(profile.bio ?? 'No bio yet.'),
                      const SizedBox(height: 12),
                      Chip(label: Text('UID ${profile.uid}')),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Published Servers',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (profile.servers.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Text('This user has no public servers.'),
                  ),
                ),
              ...profile.servers.map(
                (server) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: ListTile(
                      title: Text(server.name),
                      subtitle:
                          Text(server.description ?? '${server.host}:${server.port}'),
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
