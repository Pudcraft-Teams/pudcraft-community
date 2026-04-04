import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class AuthStore {
  static const _cookieKey = 'session.cookies';

  Future<Map<String, String>> loadCookies() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_cookieKey);
    if (raw == null || raw.isEmpty) {
      return {};
    }

    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) {
      return {};
    }

    return decoded.map((key, value) => MapEntry(key, value.toString()));
  }

  Future<void> saveCookies(Map<String, String> cookies) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_cookieKey, jsonEncode(cookies));
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cookieKey);
  }
}

