import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/community_repository.dart';

class CreatePostPage extends StatefulWidget {
  const CreatePostPage({
    super.key,
    required this.repository,
    this.circleId,
    this.circleName,
  });

  final CommunityRepository repository;
  final String? circleId;
  final String? circleName;

  @override
  State<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends State<CreatePostPage> {
  final _titleController = TextEditingController();
  final _contentController = TextEditingController();
  bool _submitting = false;
  bool _loadingSections = false;
  String? _error;
  List<CircleSection> _sections = const [];
  String? _selectedSectionId;

  @override
  void initState() {
    super.initState();
    _loadSections();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  Future<void> _loadSections() async {
    if (widget.circleId == null) {
      return;
    }

    setState(() => _loadingSections = true);
    try {
      final sections = await widget.repository.fetchCircleSections(widget.circleId!);
      if (!mounted) {
        return;
      }
      setState(() {
        _sections = sections;
        if (sections.isNotEmpty) {
          _selectedSectionId = sections.first.id;
        }
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _sections = const [];
      });
    } finally {
      if (mounted) {
        setState(() => _loadingSections = false);
      }
    }
  }

  Future<void> _submit() async {
    if (_contentController.text.trim().isEmpty) {
      setState(() => _error = 'Content cannot be empty.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final result = await widget.repository.createPost(
        title: _titleController.text.trim(),
        content: _contentController.text.trim(),
        circleId: widget.circleId,
        sectionId: _selectedSectionId,
      );
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(result);
    } on ApiException catch (error) {
      setState(() => _error = error.message);
    } catch (_) {
      setState(() => _error = 'Failed to publish post.');
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.circleName == null
        ? 'Create Post'
        : 'Post to ${widget.circleName}';

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(
              labelText: 'Title',
              hintText: 'Optional title',
            ),
          ),
          if (widget.circleId != null) ...[
            const SizedBox(height: 12),
            if (_loadingSections)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LinearProgressIndicator(),
              )
            else if (_sections.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _selectedSectionId,
                decoration: const InputDecoration(
                  labelText: 'Section',
                ),
                items: _sections
                    .map(
                      (section) => DropdownMenuItem<String>(
                        value: section.id,
                        child: Text(section.name),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  setState(() => _selectedSectionId = value);
                },
              ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _contentController,
            maxLines: 12,
            decoration: const InputDecoration(
              labelText: 'Content',
              alignLabelWithHint: true,
              hintText: 'Write your post in Markdown.',
            ),
          ),
          const SizedBox(height: 16),
          if (_error != null) ...[
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            const SizedBox(height: 12),
          ],
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: Text(_submitting ? 'Publishing...' : 'Publish'),
          ),
        ],
      ),
    );
  }
}
