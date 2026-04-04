import 'package:intl/intl.dart';

String formatDateTime(DateTime value) {
  return DateFormat('yyyy-MM-dd HH:mm').format(value.toLocal());
}
