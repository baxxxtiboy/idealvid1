"use strict";
/**
 * Oddiy hujjat-bazasi: hamma narsa xotirada turadi, o'zgarish bo'lsa diskka / MongoDB'ga yoziladi.
 *  - MONGODB_URI berilmasa  -> data/db/*.json fayllari (lokal ishlash uchun)
 *  - MONGODB_URI berilsa    -> MongoDB Atlas (Render bepul tarifida ma'lumot yo'qolmasligi uchun)
 */
const fs = require("fs");
const path = require("path");

const COLS = ["users", "products", "orders", "months", "settings"];
const FILE_ID = /^[a-f0-9-]{36}$/;

class FileBackend {
  constructor(dir) {
    this.dir = dir;
    this.timers = {};
    this.pending = {};
    fs.mkdirSync(path.join(dir, "files"), { recursive: true });
    const flush = () => this.flushAll();
    process.on("SIGTERM", () => {
      flush();
      process.exit(0);
    });
    process.on("SIGINT", () => {
      flush();
      process.exit(0);
    });
  }
  async load(col) {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(this.dir, col + ".json"), "utf8"),
      );
    } catch {
      return [];
    }
  }
  upsert(col, doc, all) {
    this._queue(col, all);
  }
  remove(col, id, all) {
    this._queue(col, all);
  }
  _queue(col, all) {
    this.pending[col] = all;
    clearTimeout(this.timers[col]);
    this.timers[col] = setTimeout(() => this._write(col), 120);
  }
  _write(col) {
    const all = this.pending[col];
    if (!all) return;
    delete this.pending[col];
    const f = path.join(this.dir, col + ".json");
    fs.writeFileSync(f + ".tmp", JSON.stringify(all()));
    fs.renameSync(f + ".tmp", f);
  }
  flushAll() {
    for (const c of Object.keys(this.pending)) {
      clearTimeout(this.timers[c]);
      this._write(c);
    }
  }
  async saveFile(id, buf, mime) {
    fs.writeFileSync(path.join(this.dir, "files", id), buf);
    fs.writeFileSync(path.join(this.dir, "files", id + ".mime"), mime);
  }
  async getFile(id) {
    if (!FILE_ID.test(id)) return null;
    try {
      return {
        buf: fs.readFileSync(path.join(this.dir, "files", id)),
        mime: fs.readFileSync(
          path.join(this.dir, "files", id + ".mime"),
          "utf8",
        ),
      };
    } catch {
      return null;
    }
  }
  async hasFile(id) {
    return FILE_ID.test(id) && fs.existsSync(path.join(this.dir, "files", id));
  }
}

class MongoBackend {
  constructor(uri, dbName) {
    this.uri = uri;
    this.dbName = dbName || "glass_ideal_vitraj";
  }
  async init() {
    const { MongoClient, Binary } = require("mongodb");
    this.Binary = Binary;
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    this.db = this.client.db(this.dbName);
  }
  async load(col) {
    const arr = await this.db.collection(col).find().toArray();
    return arr.map(({ _id, ...d }) => ({ ...d, id: _id }));
  }
  upsert(col, doc) {
    const { id, ...rest } = doc;
    return this.db
      .collection(col)
      .replaceOne({ _id: id }, rest, { upsert: true })
      .catch((e) => console.error("mongo:", e.message));
  }
  remove(col, id) {
    return this.db
      .collection(col)
      .deleteOne({ _id: id })
      .catch((e) => console.error("mongo:", e.message));
  }
  async saveFile(id, buf, mime) {
    await this.db
      .collection("files")
      .replaceOne(
        { _id: id },
        { mime, data: new this.Binary(buf) },
        { upsert: true },
      );
  }
  async getFile(id) {
    if (!FILE_ID.test(id)) return null;
    const d = await this.db.collection("files").findOne({ _id: id });
    return d ? { buf: Buffer.from(d.data.buffer), mime: d.mime } : null;
  }
  async hasFile(id) {
    return (
      FILE_ID.test(id) &&
      !!(await this.db
        .collection("files")
        .findOne({ _id: id }, { projection: { _id: 1 } }))
    );
  }
}

class Store {
  constructor() {
    this.m = {};
    COLS.forEach((c) => (this.m[c] = new Map()));
  }
  async init() {
    const uri = process.env.MONGODB_URI;
    if (uri) {
      this.be = new MongoBackend(uri, process.env.MONGODB_DB);
      await this.be.init();
      console.log("Baza: MongoDB");
    } else {
      this.be = new FileBackend(
        process.env.DATA_DIR || path.join(__dirname, "..", "data", "db"),
      );
      console.log(
        "Baza: fayl (data/db). Render'da MONGODB_URI qo'shing, aks holda qayta ishga tushganda ma'lumot yo'qoladi.",
      );
    }
    for (const c of COLS)
      for (const d of await this.be.load(c)) this.m[c].set(String(d.id), d);
  }
  list(c) {
    return [...this.m[c].values()];
  }
  get(c, id) {
    return this.m[c].get(String(id));
  }
  async put(c, doc) {
    this.m[c].set(String(doc.id), doc);
    await this.be.upsert(c, doc, () => this.list(c));
    return doc;
  }
  async del(c, id) {
    this.m[c].delete(String(id));
    await this.be.remove(c, String(id), () => this.list(c));
  }
  saveFile(id, buf, mime) {
    return this.be.saveFile(id, buf, mime);
  }
  getFile(id) {
    return this.be.getFile(id);
  }
  hasFile(id) {
    return this.be.hasFile(id);
  }
}

module.exports = { Store };
