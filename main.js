var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MDPublisher
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  endpoint: "",
  username: "",
  appPassword: "",
  uploadImages: true,
  imagePrefix: ""
};
var MDPublisher = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings");
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "publish-current-note",
      name: "\u53D1\u5E03\u5F53\u524D\u7B14\u8BB0 (Markdown \u539F\u6587)",
      callback: () => this.publishCurrentNote()
    });
    this.addSettingTab(new MDPublisherSettingTab(this.app, this));
  }
  async publishCurrentNote() {
    var _a, _b, _c, _d, _e, _f;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian.Notice("\u8BF7\u6253\u5F00\u4E00\u7BC7 Markdown \u7B14\u8BB0");
      return;
    }
    if (!this.settings.endpoint || !this.settings.username || !this.settings.appPassword) {
      new import_obsidian.Notice("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u586B\u5199\u7AEF\u70B9\u3001\u7528\u6237\u540D\u4E0E\u5E94\u7528\u5BC6\u7801");
      return;
    }
    const raw = await this.app.vault.read(file);
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (_a = cache == null ? void 0 : cache.frontmatter) != null ? _a : {};
    const body = await this.resolveWikiImages(this.stripFrontmatter(raw), file.path);
    const payload = {
      title: (_b = fm.title) != null ? _b : file.basename,
      content: body,
      content_format: "md",
      status: (_c = fm.status) != null ? _c : "draft"
      // 默认草稿更安全；要直接发布就在 frontmatter 写 status: publish
    };
    if (fm.slug) payload.slug = String(fm.slug);
    if (fm.categories) payload.categories = fm.categories;
    if (fm.tags) payload.tags = fm.tags;
    const existingId = fm.wp_id ? String(fm.wp_id) : "";
    const url = existingId ? `${this.settings.endpoint}/${existingId}` : this.settings.endpoint;
    const method = existingId ? "PUT" : "POST";
    try {
      const res = await (0, import_obsidian.requestUrl)({
        url,
        method,
        headers: {
          "Content-Type": "application/json",
          // 认证：Basic（用户名 + 应用密码）—— Worker 的 /wp-json/* 只认这套
          Authorization: "Basic " + btoa(`${this.settings.username}:${this.settings.appPassword}`)
        },
        body: JSON.stringify(payload),
        throw: false
      });
      if (res.status >= 200 && res.status < 300) {
        const data = res.json;
        if ((data == null ? void 0 : data.id) && !existingId) {
          await this.writeFrontmatterField(file, "wp_id", String(data.id));
        }
        new import_obsidian.Notice(`\u5DF2\u63D0\u4EA4\uFF1A${(_d = data == null ? void 0 : data.id) != null ? _d : "ok"}\uFF08${(_e = data == null ? void 0 : data.status) != null ? _e : ""}\uFF09`);
      } else {
        new import_obsidian.Notice(`\u53D1\u5E03\u5931\u8D25 (${res.status})\uFF1A${String((_f = res.text) != null ? _f : "").slice(0, 140)}`);
      }
    } catch (e) {
      new import_obsidian.Notice(`\u8BF7\u6C42\u5F02\u5E38\uFF1A${String(e).slice(0, 140)}`);
    }
  }
  /** 去掉开头的 --- frontmatter --- 块，只留正文 */
  stripFrontmatter(raw) {
    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3);
      if (end !== -1) return raw.slice(end + 4).replace(/^\s*\n/, "");
    }
    return raw;
  }
  /** 端点根：把各种写法（…/wp-json/wp/v2/posts、…/wp-json/wp/v2、带尾斜杠）归一成 …/wp-json/wp/v2 */
  apiBase() {
    return this.settings.endpoint.trim().replace(/\/+$/, "").replace(/\/posts$/, "").replace(/\/+$/, "");
  }
  /**
   * 处理正文里的 Obsidian 附件语法：
   *   ![[a.jpg]] / ![[folder/a.jpg]] / ![[a.jpg|说明]] / ![[a.jpg#锚点]]
   * 优先上传到 Worker 的 /wp/v2/media 并用返回的 source_url 替换；
   * 上传失败或找不到附件时退回「图片前缀 + 文件名」（前缀未配置则保持原样）。
   * ⚠️ 只处理附件，不处理 [[笔记]] 双链（Worker 端按标准 md 渲染，不认 wiki 语法）。
   */
  async resolveWikiImages(body, sourcePath) {
    var _a;
    const re = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
    const hits = [];
    let m;
    while ((m = re.exec(body)) !== null) {
      hits.push({ full: m[0], target: String(m[1]).trim(), alt: m[2] });
    }
    if (!hits.length) return body;
    const prefix = (this.settings.imagePrefix || "").trim().replace(/\/+$/, "");
    let out = body;
    let uploaded = 0, fellBack = 0, skipped = 0;
    for (const it of hits) {
      const name = it.target.split("/").pop() || it.target;
      let url = "";
      if (this.settings.uploadImages) {
        url = await this.uploadAttachment(it.target, sourcePath);
        if (url) uploaded++;
      }
      if (!url && prefix) {
        url = `${prefix}/${encodeURI(name)}`;
        fellBack++;
      }
      if (!url) {
        skipped++;
        continue;
      }
      const alt = String((_a = it.alt) != null ? _a : name).replace(/[\[\]]/g, "");
      out = out.split(it.full).join(`![${alt}](${url})`);
    }
    if (hits.length) {
      const msg = `\u56FE\u7247\uFF1A\u4E0A\u4F20 ${uploaded} \u5F20` + (fellBack ? `\uFF0C\u9000\u56DE\u524D\u7F00 ${fellBack} \u5F20` : "") + (skipped ? `\uFF0C\u672A\u5904\u7406 ${skipped} \u5F20` : "");
      new import_obsidian.Notice(msg);
    }
    return out;
  }
  /** 上传单个附件到 /wp/v2/media（简化形状：原始二进制 + X-Filename）；失败返回空串 */
  async uploadAttachment(linkpath, sourcePath) {
    if (!this.apiBase() || !this.settings.username || !this.settings.appPassword) return "";
    const f = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    if (!f) {
      new import_obsidian.Notice(`\u627E\u4E0D\u5230\u9644\u4EF6\uFF1A${linkpath}`);
      return "";
    }
    try {
      const buf = await this.app.vault.readBinary(f);
      const res = await (0, import_obsidian.requestUrl)({
        url: `${this.apiBase()}/media?name=${encodeURIComponent(f.name)}`,
        method: "POST",
        headers: {
          "Content-Type": this.mimeOf(f.extension),
          "X-Filename": encodeURIComponent(f.name),
          Authorization: "Basic " + btoa(`${this.settings.username}:${this.settings.appPassword}`)
        },
        body: buf,
        // ArrayBuffer 直传，无需自己拼 multipart
        throw: false
      });
      if (res.status >= 200 && res.status < 300) {
        const data = res.json;
        if (data && data.source_url) return String(data.source_url);
      }
      new import_obsidian.Notice(`\u56FE\u7247\u4E0A\u4F20\u5931\u8D25 (${res.status})\uFF1A${f.name}`);
    } catch (e) {
      new import_obsidian.Notice(`\u56FE\u7247\u4E0A\u4F20\u5F02\u5E38\uFF1A${String(e).slice(0, 80)}`);
    }
    return "";
  }
  mimeOf(ext) {
    const e = String(ext || "").toLowerCase();
    if (e === "png") return "image/png";
    if (e === "gif") return "image/gif";
    if (e === "webp") return "image/webp";
    if (e === "jpg" || e === "jpeg") return "image/jpeg";
    return "application/octet-stream";
  }
  /** 原子写 frontmatter 字段（避免触发多次事件 / 并发丢内容） */
  async writeFrontmatterField(file, key, value) {
    await this.app.vault.process(file, (content) => {
      if (content.startsWith("---")) {
        const end = content.indexOf("\n---", 3);
        if (end !== -1) {
          const fmBlock = content.slice(0, end);
          const rest = content.slice(end);
          if (new RegExp(`^${key}:`, "m").test(fmBlock)) {
            return fmBlock.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`) + rest;
          }
          return `${fmBlock}
${key}: ${value}${rest}`;
        }
      }
      return `---
${key}: ${value}
---
${content}`;
    });
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var MDPublisherSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u7AEF\u70B9 URL").setDesc("\u4F8B\u5982 https://doc.yuebin.uk/wp-json/wp/v2/posts").addText(
      (t) => t.setValue(this.plugin.settings.endpoint).onChange(async (v) => {
        this.plugin.settings.endpoint = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u7528\u6237\u540D").setDesc("Worker \u540E\u53F0\u7684\u7528\u6237\u540D\uFF08\u5E94\u7528\u5BC6\u7801\u8981\u7531\u8BE5\u7528\u6237\u751F\u6210\uFF09").addText(
      (t) => t.setValue(this.plugin.settings.username).onChange(async (v) => {
        this.plugin.settings.username = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5E94\u7528\u5BC6\u7801").setDesc("Worker \u540E\u53F0\u300C\u7528\u6237 \u2192 \u{1F511} \u5E94\u7528\u5BC6\u7801\u300D\u751F\u6210\uFF08\u660E\u6587\u53EA\u663E\u793A\u4E00\u6B21\uFF09\u3002\u8BA4\u8BC1\u56FA\u5B9A\u7528 Basic\u3002").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.plugin.settings.appPassword).onChange(async (v) => {
        this.plugin.settings.appPassword = v.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u4E0A\u4F20\u56FE\u7247").setDesc("\u5F00\u542F\u540E\uFF0C\u7B14\u8BB0\u91CC\u7684 ![[\u56FE.jpg]] \u4F1A\u5148\u4E0A\u4F20\u5230\u7AD9\u70B9\uFF08POST /wp-json/wp/v2/media\uFF09\uFF0C\u5E76\u7528\u8FD4\u56DE\u7684\u5730\u5740\u66FF\u6362\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.uploadImages).onChange(async (v) => {
        this.plugin.settings.uploadImages = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u56FE\u7247\u524D\u7F00\uFF08\u515C\u5E95\uFF09").setDesc("\u4E0A\u4F20\u5931\u8D25\u6216\u5173\u95ED\u81EA\u52A8\u4E0A\u4F20\u65F6\uFF0C![[a.jpg]] \u4F1A\u8F6C\u6210 ![a.jpg](\u524D\u7F00/a.jpg)\u3002\u7559\u7A7A\u5219\u539F\u6837\u4FDD\u7559\u3002").addText(
      (t) => t.setValue(this.plugin.settings.imagePrefix).onChange(async (v) => {
        this.plugin.settings.imagePrefix = v.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
