import '../models/models.dart';
import 'api_client.dart';

class CommunityRepository {
  CommunityRepository(this._client);

  final ApiClient _client;

  Future<SessionUser?> fetchSession() async {
    try {
      final json = await _client.get('/api/mobile/session');
      final user = json['user'] as Map<String, dynamic>?;
      return user == null ? null : SessionUser.fromJson(user);
    } on ApiException catch (error) {
      if (error.statusCode == 401) {
        return null;
      }
      rethrow;
    }
  }

  Future<SessionUser> login(String email, String password) async {
    final json = await _client.post(
      '/api/mobile/session/login',
      body: {'email': email, 'password': password},
    );
    return SessionUser.fromJson(json['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    await _client.delete('/api/mobile/session');
  }

  Future<CurrentUserProfile> fetchCurrentUserProfile() async {
    final json = await _client.get('/api/user/profile');
    return CurrentUserProfile.fromJson(json['data'] as Map<String, dynamic>);
  }

  Future<PublicUserProfile> fetchPublicUserProfile(String lookupId) async {
    final json = await _client.get('/api/user/$lookupId');
    return PublicUserProfile.fromJson(json['data'] as Map<String, dynamic>);
  }

  Future<PostFeedResponse> fetchFeed({String? circleId, String? cursor}) async {
    final json = await _client.get('/api/posts', query: {
      'limit': 20,
      if (circleId != null) 'circleId': circleId,
      if (cursor != null) 'cursor': cursor,
    });
    return PostFeedResponse.fromJson(json);
  }

  Future<PostDetail> fetchPostDetail(String postId) async {
    final json = await _client.get('/api/posts/$postId');
    return PostDetail.fromJson(json['data'] as Map<String, dynamic>);
  }

  Future<CreatedPostResult> createPost({
    required String title,
    required String content,
    String? circleId,
    String? sectionId,
  }) async {
    final json = await _client.post('/api/posts', body: {
      'title': title,
      'content': content,
      'circleId': circleId,
      'sectionId': sectionId,
      'tags': const <String>[],
      'images': const <String>[],
    });
    final data = json['data'] as Map<String, dynamic>;
    return CreatedPostResult(
      id: data['id'] as String,
      circleId: data['circleId'] as String?,
      sectionId: data['sectionId'] as String?,
    );
  }

  Future<List<ForumComment>> fetchPostComments(String postId) async {
    final json = await _client.get('/api/posts/$postId/comments', query: {
      'limit': 30,
    });
    return ((json['comments'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ForumComment.fromJson)
        .toList();
  }

  Future<CreatedCommentResult> createComment({
    required String postId,
    required String content,
    String? parentCommentId,
  }) async {
    final json = await _client.post('/api/posts/$postId/comments', body: {
      'content': content,
      if (parentCommentId != null) 'parentCommentId': parentCommentId,
    });
    final data = json['data'] as Map<String, dynamic>;
    return CreatedCommentResult(
      comment: ForumComment.fromJson(data),
    );
  }

  Future<ToggleActionResult> togglePostLike({
    required String postId,
    required bool like,
  }) async {
    final json = like
        ? await _client.post('/api/posts/$postId/like')
        : await _client.delete('/api/posts/$postId/like');
    return ToggleActionResult(
      active: json['liked'] as bool? ?? like,
      count: (json['likeCount'] as num?)?.toInt(),
    );
  }

  Future<ToggleActionResult> togglePostBookmark({
    required String postId,
    required bool bookmark,
  }) async {
    final json = bookmark
        ? await _client.post('/api/posts/$postId/bookmark')
        : await _client.delete('/api/posts/$postId/bookmark');
    return ToggleActionResult(
      active: json['bookmarked'] as bool? ?? bookmark,
    );
  }

  Future<ToggleActionResult> toggleCommentLike({
    required String commentId,
    required bool like,
  }) async {
    final json = like
        ? await _client.post('/api/comments/$commentId/like')
        : await _client.delete('/api/comments/$commentId/like');
    return ToggleActionResult(
      active: json['liked'] as bool? ?? like,
      count: (json['likeCount'] as num?)?.toInt(),
    );
  }

  Future<CircleListResponse> fetchCircles({
    int page = 1,
    String? search,
  }) async {
    final json = await _client.get('/api/circles', query: {
      'page': page,
      'limit': 20,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    });
    return CircleListResponse.fromJson(json);
  }

  Future<CircleDetail> fetchCircleDetail(String idOrSlug) async {
    final json = await _client.get('/api/circles/$idOrSlug');
    return CircleDetail.fromJson(json['data'] as Map<String, dynamic>);
  }

  Future<List<CircleSection>> fetchCircleSections(String idOrSlug) async {
    final json = await _client.get('/api/circles/$idOrSlug/sections');
    return ((json['sections'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(CircleSection.fromJson)
        .toList();
  }

  Future<ServerListResponse> fetchServers({
    int page = 1,
    String? search,
    String sort = 'popular',
  }) async {
    final json = await _client.get('/api/servers', query: {
      'page': page,
      'limit': 20,
      'sort': sort,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    });
    return ServerListResponse.fromJson(json);
  }

  Future<ServerDetail> fetchServerDetail(String id) async {
    final json = await _client.get('/api/servers/$id');
    return ServerDetail.fromJson(json['data'] as Map<String, dynamic>);
  }

  Future<bool> fetchServerFavoriteStatus(String id) async {
    final json = await _client.get('/api/servers/$id/favorite');
    return json['favorited'] as bool? ?? false;
  }

  Future<ToggleActionResult> toggleServerFavorite({
    required String id,
    required bool favorite,
  }) async {
    final json = favorite
        ? await _client.post('/api/servers/$id/favorite')
        : await _client.delete('/api/servers/$id/favorite');
    return ToggleActionResult(
      active: json['favorited'] as bool? ?? favorite,
      count: (json['favoriteCount'] as num?)?.toInt(),
    );
  }

  Future<InboxResponse> fetchInbox({
    int page = 1,
    bool unreadOnly = false,
  }) async {
    final json = await _client.get('/api/mobile/inbox', query: {
      'page': page,
      'limit': 30,
      'unreadOnly': unreadOnly,
    });
    return InboxResponse.fromJson(json);
  }

  Future<void> markForumNotificationsRead({bool all = true}) async {
    await _client.post('/api/forum/notifications/read', body: {
      if (all) 'all': true,
    });
  }

  Future<SearchResult> search(String query) async {
    final json = await _client.get('/api/search', query: {
      'q': query,
      'limit': 20,
    });
    return SearchResult.fromJson(json);
  }

  Future<List<ServerListItem>> fetchFavoriteServers() async {
    final json = await _client.get('/api/user/favorites');
    return ((json['data'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ServerListItem.fromJson)
        .toList();
  }

  Future<List<PostItem>> fetchBookmarkedPosts() async {
    final json = await _client.get('/api/user/bookmarks', query: {
      'limit': 20,
    });
    return ((json['posts'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(PostItem.fromJson)
        .toList();
  }
}
