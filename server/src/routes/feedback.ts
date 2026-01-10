import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const router = express.Router();

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, '../../uploads/feedback_images');
const DOCS_DIR = path.join(__dirname, '../../../docs');

// Create directories if they don't exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Configure multer for memory storage (we'll process and save manually)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper to format current date
function formatDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// Helper to format timestamp for filenames
function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Helper to append feedback to markdown file
async function appendToMarkdown(filePath: string, entry: string): Promise<void> {
  let content = '';

  // Check if file exists and has content
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    // Initialize with header
    const fileName = path.basename(filePath, '.md');
    const header = fileName === 'user_feature_request_backlog'
      ? '# User Feature Requests\n\nTrack user-submitted feature requests.\n\n---\n\n'
      : '# Bug Reports\n\nTrack user-submitted bug reports.\n\n---\n\n';
    content = header;
  }

  // Append new entry
  content += entry;
  fs.writeFileSync(filePath, content, 'utf-8');
}

// POST /api/feedback - Submit feedback (feature request or bug report)
router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const { type, title, description, requestor_name } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    // Validate required fields
    if (!type || !description || !requestor_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, description, requestor_name'
      });
    }

    if (!['feature_request', 'bug_report'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be feature_request or bug_report'
      });
    }

    const timestamp = formatTimestamp();
    const date = formatDate();
    const sanitizedTitle = title || `${type === 'feature_request' ? 'Feature' : 'Bug'}: ${description.slice(0, 50)}...`;

    // Process and save images
    const savedImages: string[] = [];
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = `${type}_${timestamp}_${i + 1}.webp`;
        const outputPath = path.join(UPLOADS_DIR, filename);

        try {
          // Compress image to webp with quality 80, max 1200px width
          await sharp(file.buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);

          savedImages.push(filename);
          logger.info(`Saved compressed image: ${filename}`);
        } catch (imgErr) {
          logger.error(`Failed to process image ${i + 1}:`, imgErr);
        }
      }
    }

    // Build markdown entry
    const imageLinks = savedImages.length > 0
      ? savedImages.map(img => `![Screenshot](../server/uploads/feedback_images/${img})`).join('\n')
      : '';

    const entry = `
## ${sanitizedTitle}
**Date:** ${date}
**Submitted by:** ${requestor_name}
**Status:** \`PENDING\`

### Description
${description}

${imageLinks ? `### Screenshots\n${imageLinks}\n` : ''}
---

`;

    // Append to appropriate markdown file
    const mdFile = type === 'feature_request'
      ? path.join(DOCS_DIR, 'user_feature_request_backlog.md')
      : path.join(DOCS_DIR, 'bug_reports.md');

    await appendToMarkdown(mdFile, entry);

    logger.info(`Feedback submitted: ${type} by ${requestor_name}`);

    res.json({
      success: true,
      message: `${type === 'feature_request' ? 'Feature request' : 'Bug report'} submitted successfully`,
      images_saved: savedImages.length
    });

  } catch (error) {
    logger.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
});

export default router;
