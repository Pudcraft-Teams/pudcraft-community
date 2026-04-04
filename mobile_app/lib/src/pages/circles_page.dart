import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/community_repository.dart';
import 'circle_detail_page.dart';
import 'widgets.dart';

class CirclesPage extends StatefulWidget {
  const CirclesPage({super.key, required this.repository});

  final CommunityRepository repository;

  @override
  State<CirclesPage> createState() => _CirclesPageState();
}

class _CirclesPageState extends State<CirclesPage> {
  final _searchController = TextEditingController();
  late Future<CircleListResponse> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.fetchCircles();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _search() {
    setState(() {
      _future = widget.repository.fetchCircles(search: _searchController.text);
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
                    hintText: '搜索圈子',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onSubmitted: (value) => _search(),
                ),
              ),
              const SizedBox(width: 12),
              FilledButton(
                onPressed: _search,
                child: const Text('搜索'),
              ),
            ],
          ),
        ),
        Expanded(
          child: FutureBuilder<CircleListResponse>(
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
              final circles = snapshot.data?.circles ?? const <CircleItem>[];
              if (circles.isEmpty) {
                return const EmptyView(title: '暂无圈子', message: '没有匹配结果。');
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                itemCount: circles.length,
                separatorBuilder: (context, index) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final circle = circles[index];
                  return Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(24),
                      onTap: () {
                        Navigator.of(context).push(MaterialPageRoute(
                          builder: (routeContext) => CircleDetailPage(
                            repository: widget.repository,
                            circleIdOrSlug: circle.slug,
                          ),
                        ));
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              circle.name,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            Text(circle.description ?? '这个圈子还没有简介。'),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              children: [
                                Chip(label: Text('${circle.memberCount} 成员')),
                                Chip(label: Text('${circle.postCount} 帖子')),
                                if (circle.isMember == true)
                                  const Chip(label: Text('已加入')),
                              ],
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
