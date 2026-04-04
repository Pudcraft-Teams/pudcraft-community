class SessionUser {
  const SessionUser({
    required this.id,
    required this.uid,
    required this.email,
    required this.role,
    this.name,
    this.image,
  });

  final String id;
  final int uid;
  final String email;
  final String role;
  final String? name;
  final String? image;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      uid: (json['uid'] as num).toInt(),
      email: json['email'] as String? ?? '',
      role: json['role'] as String? ?? 'user',
      name: json['name'] as String?,
      image: json['image'] as String?,
    );
  }
}

class CurrentUserProfile {
  const CurrentUserProfile({
    required this.id,
    required this.uid,
    required this.email,
    this.name,
    this.image,
    this.bio,
  });

  final String id;
  final int uid;
  final String email;
  final String? name;
  final String? image;
  final String? bio;

  factory CurrentUserProfile.fromJson(Map<String, dynamic> json) {
    return CurrentUserProfile(
      id: json['id'] as String,
      uid: (json['uid'] as num).toInt(),
      email: json['email'] as String? ?? '',
      name: json['name'] as String?,
      image: json['image'] as String?,
      bio: json['bio'] as String?,
    );
  }
}

class PostAuthor {
  const PostAuthor({
    required this.id,
    required this.uid,
    this.name,
    this.image,
  });

  final String id;
  final int uid;
  final String? name;
  final String? image;

  factory PostAuthor.fromJson(Map<String, dynamic> json) {
    return PostAuthor(
      id: json['id'] as String,
      uid: (json['uid'] as num).toInt(),
      name: json['name'] as String?,
      image: json['image'] as String?,
    );
  }
}

class CircleSummary {
  const CircleSummary({
    required this.id,
    required this.name,
    required this.slug,
  });

  final String id;
  final String name;
  final String slug;

  factory CircleSummary.fromJson(Map<String, dynamic> json) {
    return CircleSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
    );
  }
}

class SectionSummary {
  const SectionSummary({
    required this.id,
    required this.name,
  });

  final String id;
  final String name;

  factory SectionSummary.fromJson(Map<String, dynamic> json) {
    return SectionSummary(
      id: json['id'] as String,
      name: json['name'] as String,
    );
  }
}

class CircleSection {
  const CircleSection({
    required this.id,
    required this.name,
    required this.sortOrder,
    this.description,
  });

  final String id;
  final String name;
  final int sortOrder;
  final String? description;

  factory CircleSection.fromJson(Map<String, dynamic> json) {
    return CircleSection(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      description: json['description'] as String?,
    );
  }
}

class PostItem {
  const PostItem({
    required this.id,
    required this.title,
    required this.contentPreview,
    required this.author,
    required this.viewCount,
    required this.likeCount,
    required this.commentCount,
    required this.isPinned,
    required this.images,
    required this.createdAt,
    this.circle,
    this.section,
    this.isLiked,
    this.isBookmarked,
  });

  final String id;
  final String title;
  final String contentPreview;
  final PostAuthor author;
  final int viewCount;
  final int likeCount;
  final int commentCount;
  final bool isPinned;
  final List<String> images;
  final DateTime createdAt;
  final CircleSummary? circle;
  final SectionSummary? section;
  final bool? isLiked;
  final bool? isBookmarked;

  factory PostItem.fromJson(Map<String, dynamic> json) {
    return PostItem(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      contentPreview: json['contentPreview'] as String? ?? '',
      author: PostAuthor.fromJson(json['author'] as Map<String, dynamic>),
      circle: json['circle'] == null
          ? null
          : CircleSummary.fromJson(json['circle'] as Map<String, dynamic>),
      section: json['section'] == null
          ? null
          : SectionSummary.fromJson(json['section'] as Map<String, dynamic>),
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      isPinned: json['isPinned'] as bool? ?? false,
      images: ((json['images'] as List?) ?? []).whereType<String>().toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      isLiked: json['isLiked'] as bool?,
      isBookmarked: json['isBookmarked'] as bool?,
    );
  }
}

class PostDetail {
  const PostDetail({
    required this.id,
    required this.title,
    required this.content,
    required this.author,
    required this.viewCount,
    required this.likeCount,
    required this.commentCount,
    required this.isPinned,
    required this.images,
    required this.createdAt,
    required this.updatedAt,
    this.circle,
    this.section,
    this.isLiked,
    this.isBookmarked,
  });

  final String id;
  final String title;
  final String content;
  final PostAuthor author;
  final int viewCount;
  final int likeCount;
  final int commentCount;
  final bool isPinned;
  final List<String> images;
  final DateTime createdAt;
  final DateTime updatedAt;
  final CircleSummary? circle;
  final SectionSummary? section;
  final bool? isLiked;
  final bool? isBookmarked;

  factory PostDetail.fromJson(Map<String, dynamic> json) {
    return PostDetail(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      content: json['content'] as String? ?? '',
      author: PostAuthor.fromJson(json['author'] as Map<String, dynamic>),
      circle: json['circle'] == null
          ? null
          : CircleSummary.fromJson(json['circle'] as Map<String, dynamic>),
      section: json['section'] == null
          ? null
          : SectionSummary.fromJson(json['section'] as Map<String, dynamic>),
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      isPinned: json['isPinned'] as bool? ?? false,
      images: ((json['images'] as List?) ?? []).whereType<String>().toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      isLiked: json['isLiked'] as bool?,
      isBookmarked: json['isBookmarked'] as bool?,
    );
  }

  PostDetail copyWith({
    int? likeCount,
    int? commentCount,
    bool? isLiked,
    bool? isBookmarked,
  }) {
    return PostDetail(
      id: id,
      title: title,
      content: content,
      author: author,
      viewCount: viewCount,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      isPinned: isPinned,
      images: images,
      createdAt: createdAt,
      updatedAt: updatedAt,
      circle: circle,
      section: section,
      isLiked: isLiked ?? this.isLiked,
      isBookmarked: isBookmarked ?? this.isBookmarked,
    );
  }
}

class ForumComment {
  const ForumComment({
    required this.id,
    required this.content,
    required this.author,
    required this.likeCount,
    required this.createdAt,
    this.parentCommentId,
    this.parentAuthorName,
    this.isLiked,
  });

  final String id;
  final String content;
  final PostAuthor author;
  final int likeCount;
  final DateTime createdAt;
  final String? parentCommentId;
  final String? parentAuthorName;
  final bool? isLiked;

  factory ForumComment.fromJson(Map<String, dynamic> json) {
    final parentAuthor = json['parentAuthor'] as Map<String, dynamic>?;
    return ForumComment(
      id: json['id'] as String,
      content: json['content'] as String? ?? '',
      author: PostAuthor.fromJson(json['author'] as Map<String, dynamic>),
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      parentCommentId: json['parentCommentId'] as String?,
      parentAuthorName: parentAuthor?['name'] as String?,
      isLiked: json['isLiked'] as bool?,
    );
  }

  ForumComment copyWith({
    int? likeCount,
    bool? isLiked,
  }) {
    return ForumComment(
      id: id,
      content: content,
      author: author,
      likeCount: likeCount ?? this.likeCount,
      createdAt: createdAt,
      parentCommentId: parentCommentId,
      parentAuthorName: parentAuthorName,
      isLiked: isLiked ?? this.isLiked,
    );
  }
}

class CircleItem {
  const CircleItem({
    required this.id,
    required this.name,
    required this.slug,
    required this.memberCount,
    required this.postCount,
    required this.createdAt,
    this.description,
    this.icon,
    this.isMember,
  });

  final String id;
  final String name;
  final String slug;
  final int memberCount;
  final int postCount;
  final DateTime createdAt;
  final String? description;
  final String? icon;
  final bool? isMember;

  factory CircleItem.fromJson(Map<String, dynamic> json) {
    return CircleItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
      postCount: (json['postCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      description: json['description'] as String?,
      icon: json['icon'] as String?,
      isMember: json['isMember'] as bool?,
    );
  }
}

class CircleDetail {
  const CircleDetail({
    required this.id,
    required this.name,
    required this.slug,
    required this.memberCount,
    required this.postCount,
    required this.createdAt,
    this.description,
    this.icon,
    this.banner,
    this.creatorName,
    this.memberRole,
    this.isMember,
    this.serverName,
  });

  final String id;
  final String name;
  final String slug;
  final int memberCount;
  final int postCount;
  final DateTime createdAt;
  final String? description;
  final String? icon;
  final String? banner;
  final String? creatorName;
  final String? memberRole;
  final bool? isMember;
  final String? serverName;

  factory CircleDetail.fromJson(Map<String, dynamic> json) {
    final creator = json['creator'] as Map<String, dynamic>?;
    final server = json['server'] as Map<String, dynamic>?;
    return CircleDetail(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
      postCount: (json['postCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      description: json['description'] as String?,
      icon: json['icon'] as String?,
      banner: json['banner'] as String?,
      creatorName: creator?['name'] as String?,
      memberRole: json['memberRole'] as String?,
      isMember: json['isMember'] as bool?,
      serverName: server?['name'] as String?,
    );
  }
}

class ServerStatus {
  const ServerStatus({
    required this.online,
    this.playerCount,
    this.maxPlayers,
    this.checkedAt,
  });

  final bool online;
  final int? playerCount;
  final int? maxPlayers;
  final String? checkedAt;

  factory ServerStatus.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const ServerStatus(online: false);
    }
    return ServerStatus(
      online: json['online'] as bool? ?? false,
      playerCount: (json['playerCount'] as num?)?.toInt(),
      maxPlayers: (json['maxPlayers'] as num?)?.toInt(),
      checkedAt: json['checkedAt'] as String?,
    );
  }
}

class ServerListItem {
  const ServerListItem({
    required this.id,
    required this.psid,
    required this.name,
    required this.host,
    required this.port,
    required this.isVerified,
    required this.status,
    this.description,
    this.iconUrl,
    this.favoriteCount,
    this.tags = const [],
  });

  final String id;
  final int psid;
  final String name;
  final String host;
  final int port;
  final bool isVerified;
  final ServerStatus status;
  final String? description;
  final String? iconUrl;
  final int? favoriteCount;
  final List<String> tags;

  factory ServerListItem.fromJson(Map<String, dynamic> json) {
    return ServerListItem(
      id: json['id'] as String,
      psid: (json['psid'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '',
      host: json['host'] as String? ?? '',
      port: (json['port'] as num?)?.toInt() ?? 0,
      isVerified: json['isVerified'] as bool? ?? false,
      status: ServerStatus.fromJson(json['status'] as Map<String, dynamic>?),
      description: json['description'] as String?,
      iconUrl: json['iconUrl'] as String?,
      favoriteCount: (json['favoriteCount'] as num?)?.toInt(),
      tags: ((json['tags'] as List?) ?? []).whereType<String>().toList(),
    );
  }
}

class ServerDetail {
  const ServerDetail({
    required this.id,
    required this.psid,
    required this.name,
    required this.host,
    required this.port,
    required this.content,
    required this.isVerified,
    required this.status,
    this.isFavorited,
    this.description,
    this.iconUrl,
    this.imageUrl,
    this.favoriteCount,
    this.tags = const [],
  });

  final String id;
  final int psid;
  final String name;
  final String host;
  final int port;
  final String? description;
  final String? content;
  final bool isVerified;
  final ServerStatus status;
  final bool? isFavorited;
  final String? iconUrl;
  final String? imageUrl;
  final int? favoriteCount;
  final List<String> tags;

  factory ServerDetail.fromJson(Map<String, dynamic> json) {
    return ServerDetail(
      id: json['id'] as String,
      psid: (json['psid'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '',
      host: json['host'] as String? ?? '',
      port: (json['port'] as num?)?.toInt() ?? 0,
      content: json['content'] as String?,
      description: json['description'] as String?,
      isVerified: json['isVerified'] as bool? ?? false,
      status: ServerStatus.fromJson(json['status'] as Map<String, dynamic>?),
      isFavorited: json['isFavorited'] as bool?,
      iconUrl: json['iconUrl'] as String?,
      imageUrl: json['imageUrl'] as String?,
      favoriteCount: (json['favoriteCount'] as num?)?.toInt(),
      tags: ((json['tags'] as List?) ?? []).whereType<String>().toList(),
    );
  }

  ServerDetail copyWith({
    int? favoriteCount,
    bool? isFavorited,
  }) {
    return ServerDetail(
      id: id,
      psid: psid,
      name: name,
      host: host,
      port: port,
      content: content,
      isVerified: isVerified,
      status: status,
      isFavorited: isFavorited ?? this.isFavorited,
      description: description,
      iconUrl: iconUrl,
      imageUrl: imageUrl,
      favoriteCount: favoriteCount ?? this.favoriteCount,
      tags: tags,
    );
  }
}

class InboxItem {
  const InboxItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
    this.destination,
    this.sourceUser,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final bool read;
  final DateTime createdAt;
  final String? destination;
  final PostAuthor? sourceUser;

  factory InboxItem.fromJson(Map<String, dynamic> json) {
    return InboxItem(
      id: json['id'] as String,
      kind: json['kind'] as String? ?? 'server',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      read: json['read'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      destination: json['destination'] as String?,
      sourceUser: json['sourceUser'] == null
          ? null
          : PostAuthor.fromJson(json['sourceUser'] as Map<String, dynamic>),
    );
  }
}

class SearchUser {
  const SearchUser({
    required this.id,
    required this.uid,
    this.name,
    this.image,
  });

  final String id;
  final int uid;
  final String? name;
  final String? image;

  factory SearchUser.fromJson(Map<String, dynamic> json) {
    return SearchUser(
      id: json['id'] as String,
      uid: (json['uid'] as num).toInt(),
      name: json['name'] as String?,
      image: json['image'] as String?,
    );
  }
}

class SearchResult {
  const SearchResult({
    required this.type,
    required this.posts,
    required this.users,
    this.tagDisplayName,
  });

  final String type;
  final List<PostItem> posts;
  final List<SearchUser> users;
  final String? tagDisplayName;

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    final tag = json['tag'] as Map<String, dynamic>?;
    return SearchResult(
      type: json['type'] as String? ?? 'text',
      posts: ((json['posts'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PostItem.fromJson)
          .toList(),
      users: ((json['users'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(SearchUser.fromJson)
          .toList(),
      tagDisplayName: tag?['displayName'] as String? ?? tag?['name'] as String?,
    );
  }
}

class PostFeedResponse {
  const PostFeedResponse({
    required this.posts,
    required this.nextCursor,
  });

  final List<PostItem> posts;
  final String? nextCursor;

  factory PostFeedResponse.fromJson(Map<String, dynamic> json) {
    return PostFeedResponse(
      posts: ((json['posts'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PostItem.fromJson)
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );
  }
}

class CircleListResponse {
  const CircleListResponse({
    required this.circles,
    required this.page,
    required this.totalPages,
  });

  final List<CircleItem> circles;
  final int page;
  final int totalPages;

  factory CircleListResponse.fromJson(Map<String, dynamic> json) {
    return CircleListResponse(
      circles: ((json['circles'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(CircleItem.fromJson)
          .toList(),
      page: (json['page'] as num?)?.toInt() ?? 1,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}

class ServerListResponse {
  const ServerListResponse({
    required this.items,
    required this.page,
    required this.totalPages,
  });

  final List<ServerListItem> items;
  final int page;
  final int totalPages;

  factory ServerListResponse.fromJson(Map<String, dynamic> json) {
    final pagination = json['pagination'] as Map<String, dynamic>? ?? const {};
    return ServerListResponse(
      items: ((json['data'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ServerListItem.fromJson)
          .toList(),
      page: (pagination['page'] as num?)?.toInt() ?? 1,
      totalPages: (pagination['totalPages'] as num?)?.toInt() ?? 1,
    );
  }
}

class PublicUserProfile {
  const PublicUserProfile({
    required this.id,
    required this.uid,
    required this.servers,
    this.name,
    this.image,
    this.bio,
  });

  final String id;
  final int uid;
  final List<ServerListItem> servers;
  final String? name;
  final String? image;
  final String? bio;

  factory PublicUserProfile.fromJson(Map<String, dynamic> json) {
    return PublicUserProfile(
      id: json['id'] as String,
      uid: (json['uid'] as num).toInt(),
      servers: ((json['servers'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ServerListItem.fromJson)
          .toList(),
      name: json['name'] as String?,
      image: json['image'] as String?,
      bio: json['bio'] as String?,
    );
  }
}

class InboxResponse {
  const InboxResponse({
    required this.notifications,
    required this.page,
    required this.totalPages,
    required this.unreadCount,
  });

  final List<InboxItem> notifications;
  final int page;
  final int totalPages;
  final int unreadCount;

  factory InboxResponse.fromJson(Map<String, dynamic> json) {
    return InboxResponse(
      notifications: ((json['notifications'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .map(InboxItem.fromJson)
          .toList(),
      page: (json['page'] as num?)?.toInt() ?? 1,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class ToggleActionResult {
  const ToggleActionResult({
    required this.active,
    this.count,
  });

  final bool active;
  final int? count;
}

class CreatedPostResult {
  const CreatedPostResult({
    required this.id,
    this.circleId,
    this.sectionId,
  });

  final String id;
  final String? circleId;
  final String? sectionId;
}

class CreatedCommentResult {
  const CreatedCommentResult({
    required this.comment,
  });

  final ForumComment comment;
}
