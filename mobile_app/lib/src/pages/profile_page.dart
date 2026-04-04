import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import 'login_page.dart';
import 'user_library_page.dart';
import 'widgets.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({
    super.key,
    required this.repository,
    required this.user,
    required this.onLoggedOut,
    required this.onRequireLogin,
  });

  final CommunityRepository repository;
  final SessionUser? user;
  final VoidCallback onLoggedOut;
  final VoidCallback onRequireLogin;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  Future<CurrentUserProfile>? _future;

  @override
  void initState() {
    super.initState();
    _prime();
  }

  @override
  void didUpdateWidget(covariant ProfilePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.user?.id != oldWidget.user?.id) {
      _prime();
    }
  }

  void _prime() {
    _future = widget.user == null
        ? null
        : widget.repository.fetchCurrentUserProfile();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Sign in to open your profile and personal library.'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (routeContext) => LoginPage(
                        repository: widget.repository,
                        onLoggedIn: () {
                          Navigator.of(context).pop();
                          widget.onRequireLogin();
                        },
                      ),
                    ),
                  );
                },
                child: const Text('Sign In'),
              ),
            ],
          ),
        ),
      );
    }

    return FutureBuilder<CurrentUserProfile>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const LoadingView();
        }
        if (snapshot.hasError) {
          return ErrorView(
            message: snapshot.error.toString(),
            onRetry: () => setState(() => _future = widget.repository.fetchCurrentUserProfile()),
          );
        }

        final profile = snapshot.data!;
        return RefreshIndicator(
          onRefresh: () async {
            setState(() => _future = widget.repository.fetchCurrentUserProfile());
            await _future;
          },
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
                        profile.name ?? 'Unnamed user',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      Text(profile.email),
                      const SizedBox(height: 8),
                      Text(profile.bio ?? 'No bio yet.'),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          Chip(label: Text('UID ${profile.uid}')),
                          Chip(label: Text(widget.user!.role)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.collections_bookmark_outlined),
                      title: const Text('My Library'),
                      subtitle: const Text('Favorites, bookmarks, and my servers'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (routeContext) => UserLibraryPage(
                              repository: widget.repository,
                              uid: profile.uid,
                            ),
                          ),
                        );
                      },
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.logout),
                      title: const Text('Sign Out'),
                      onTap: () async {
                        await widget.repository.logout();
                        widget.onLoggedOut();
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
