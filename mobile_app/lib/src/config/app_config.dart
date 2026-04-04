class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static Uri resolve(String path, [Map<String, dynamic>? query]) {
    final base = Uri.parse(apiBaseUrl);
    return base.replace(
      path: '${base.path}${path.startsWith('/') ? path : '/$path'}',
      queryParameters: query?.map(
        (key, value) => MapEntry(key, value?.toString()),
      ),
    );
  }
}

