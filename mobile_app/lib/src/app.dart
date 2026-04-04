import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'models/models.dart';
import 'pages/circles_page.dart';
import 'pages/feed_page.dart';
import 'pages/inbox_page.dart';
import 'pages/profile_page.dart';
import 'pages/search_page.dart';
import 'pages/servers_page.dart';
import 'services/api_client.dart';
import 'services/auth_store.dart';
import 'services/community_repository.dart';
import 'theme/app_theme.dart';

class PudcraftApp extends StatefulWidget {
  const PudcraftApp({super.key});

  @override
  State<PudcraftApp> createState() => _PudcraftAppState();
}

class _PudcraftAppState extends State<PudcraftApp> {
  late final ApiClient _client;
  late final AuthStore _authStore;
  late final CommunityRepository _repository;
  SessionUser? _user;
  bool _bootstrapped = false;
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _client = ApiClient(http.Client());
    _authStore = AuthStore();
    _repository = CommunityRepository(_client);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final cookies = await _authStore.loadCookies();
    _client.restoreCookies(cookies);
    try {
      _user = await _repository.fetchSession();
    } catch (_) {
      _user = null;
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _bootstrapped = true;
    });
  }

  Future<void> _refreshSession() async {
    _user = await _repository.fetchSession();
    await _authStore.saveCookies(_client.dumpCookies());
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _logout() async {
    await _authStore.clear();
    _client.restoreCookies(const {});
    if (!mounted) {
      return;
    }
    setState(() {
      _user = null;
      _tabIndex = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pudcraft Mobile',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: !_bootstrapped
          ? const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            )
          : Scaffold(
              appBar: AppBar(
                title: const Text('Pudcraft Mobile'),
                actions: [
                  Builder(
                    builder: (context) {
                      return IconButton(
                        icon: const Icon(Icons.search),
                        onPressed: () {
                          Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => SearchPage(repository: _repository),
                          ));
                        },
                      );
                    },
                  ),
                ],
              ),
              body: IndexedStack(
                index: _tabIndex,
                children: [
                  FeedPage(repository: _repository),
                  ServersPage(repository: _repository),
                  CirclesPage(repository: _repository),
                  InboxPage(
                    repository: _repository,
                    loggedIn: _user != null,
                    onRequireLogin: () {
                      setState(() => _tabIndex = 4);
                    },
                  ),
                  ProfilePage(
                    repository: _repository,
                    user: _user,
                    onLoggedOut: _logout,
                    onRequireLogin: _refreshSession,
                  ),
                ],
              ),
              bottomNavigationBar: NavigationBar(
                selectedIndex: _tabIndex,
                onDestinationSelected: (index) {
                  setState(() => _tabIndex = index);
                },
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.forum_outlined),
                    selectedIcon: Icon(Icons.forum),
                    label: '广场',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.dns_outlined),
                    selectedIcon: Icon(Icons.dns),
                    label: '服务器',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.groups_outlined),
                    selectedIcon: Icon(Icons.groups),
                    label: '圈子',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.notifications_outlined),
                    selectedIcon: Icon(Icons.notifications),
                    label: '通知',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person),
                    label: '我的',
                  ),
                ],
              ),
            ),
    );
  }
}
