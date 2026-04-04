import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._httpClient);

  final http.Client _httpClient;
  final Map<String, String> _cookies = <String, String>{};

  void restoreCookies(Map<String, String> cookies) {
    _cookies
      ..clear()
      ..addAll(cookies);
  }

  Map<String, String> dumpCookies() => Map<String, String>.from(_cookies);

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    final response = await _httpClient.get(
      AppConfig.resolve(path, query),
      headers: _headers(),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final response = await _httpClient.post(
      AppConfig.resolve(path),
      headers: _headers(),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(response);
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final response = await _httpClient.delete(
      AppConfig.resolve(path),
      headers: _headers(),
    );
    return _decode(response);
  }

  Map<String, String> _headers() {
    final headers = <String, String>{
      'accept': 'application/json',
      'content-type': 'application/json',
    };
    if (_cookies.isNotEmpty) {
      headers['cookie'] = _cookies.entries.map((e) => '${e.key}=${e.value}').join('; ');
    }
    return headers;
  }

  Map<String, dynamic> _decode(http.Response response) {
    _mergeCookies(response.headers['set-cookie']);
    final payload = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;

    if (response.statusCode >= 400) {
      final message = payload['error'] as String? ??
          payload['message'] as String? ??
          'Request failed';
      throw ApiException(message, statusCode: response.statusCode);
    }

    return payload;
  }

  void _mergeCookies(String? setCookieHeader) {
    if (setCookieHeader == null || setCookieHeader.isEmpty) {
      return;
    }

    for (final cookie in _splitSetCookieHeader(setCookieHeader)) {
      final pair = cookie.split(';').first.trim();
      final index = pair.indexOf('=');
      if (index <= 0) {
        continue;
      }
      final name = pair.substring(0, index).trim();
      final value = pair.substring(index + 1).trim();
      if (name.isEmpty) {
        continue;
      }
      _cookies[name] = value;
    }
  }

  List<String> _splitSetCookieHeader(String header) {
    final cookies = <String>[];
    var start = 0;
    for (var index = 0; index < header.length - 1; index += 1) {
      if (header[index] != ',' || header[index + 1] != ' ') {
        continue;
      }
      final next = header.substring(index + 2);
      if (!RegExp(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=").hasMatch(next)) {
        continue;
      }
      cookies.add(header.substring(start, index).trim());
      start = index + 2;
    }
    cookies.add(header.substring(start).trim());
    return cookies.where((value) => value.isNotEmpty).toList();
  }
}

