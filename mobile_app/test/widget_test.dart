import 'package:flutter_test/flutter_test.dart';

import 'package:pudcraft_mobile/src/app.dart';

void main() {
  testWidgets('app boots', (WidgetTester tester) async {
    await tester.pumpWidget(const PudcraftApp());
    expect(find.text('Pudcraft Mobile'), findsOneWidget);
  });
}
