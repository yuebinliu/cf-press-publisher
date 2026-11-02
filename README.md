# CF Press Publisher

An Obsidian plugin that publishes the note you are looking at to a [CF Press](https://cfpress.org) site.

Markdown goes in exactly as written — no HTML conversion, no reformatting. Images written as `![[image.png]]` are uploaded to the CMS media library and the links are rewritten. After the first publish the post id is written back into the note's frontmatter, so publishing again updates the post instead of creating a duplicate.

## Install

The plugin is not in the community store yet, so it is a manual install:

1. Download `cf-press-publisher-<version>.zip` from [releases](https://github.com/yuebinliu/cf-press-publisher/releases) (or `/releases/obsidian/latest.zip` on cfpress.org).
2. Unzip it into `<your vault>/.obsidian/plugins/cfpress-publisher/`. The folder must end up containing `main.js` and `manifest.json` directly.
3. In Obsidian: **Settings → Community plugins → Installed plugins** → enable **CF Press Publisher**.

Obsidian only reads plugins from that directory; if it does not exist yet, create it.

## Settings

| Field | Value |
|---|---|
| **Endpoint** | `https://your-site/wp-json/wp/v2/posts` — the collection URL, not just the domain |
| **Username** | your CMS login name |
| **Application password** | created in the CMS under **Users → 🔑 App passwords** |

Authentication is HTTP Basic, the same shape WordPress uses. The CMS accepts only application passwords on `/wp-json/*`, so your normal login password will not work.

Two optional switches:

- **Upload images** — push local attachments to the CMS and replace `![[…]]` with the returned URL.
- **Image prefix** — fallback used when an attachment cannot be uploaded.

## Publishing

Command palette → **发布当前笔记 (Markdown 原文)**.

The request sends `content_format: md`, so the CMS stores Markdown and renders it with the site's own theme. Code blocks, tables and headings look the same as they do in Obsidian.

## Frontmatter

Everything except the title is optional; the title falls back to the file name.

```yaml
---
title: Where it should be
slug: where-it-should-be
status: publish        # default is draft
categories: [tech]
tags: [obsidian, workflow]
wp_id: 179354571311647
---
```

- **status** — `draft` unless you say otherwise. That default is deliberate: a mis-click should not publish.
- **categories / tags** — names or slugs. A term that does not exist yet is created on the fly.
- **wp_id** — written back automatically after the first publish. Delete it and the next publish creates a new post.

## Build

```bash
npm install
npm run build     # main.ts -> main.js (esbuild, obsidian marked external)
```

`main.js` is committed because Obsidian loads it directly; the release zip contains only `main.js` and `manifest.json`.

## License

MIT
