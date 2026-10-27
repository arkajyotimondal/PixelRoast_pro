/**
 * MongoDB-backed store. Every query filters by ownerId. Malformed ids return
 * "not found" instead of throwing a CastError, so they surface as 404s.
 */
import { isValidObjectId } from "mongoose";
import { connectDB } from "@/lib/db";
import Audit from "@/models/Audit";
import Screenshot from "@/models/Screenshot";
import type { AuditRecord, AuditStore, StoredAudit } from "./types";

type LeanAudit = AuditRecord & { _id: unknown; createdAt: Date };

function toStored(doc: LeanAudit): StoredAudit {
  return { ...doc, _id: String(doc._id), createdAt: new Date(doc.createdAt) };
}

export function createMongoStore(uri: string): AuditStore {
  const ready = () => connectDB(uri);

  return {
    engine: "mongodb",

    async createAudit(record) {
      await ready();
      const doc = await Audit.create(record);
      return toStored(doc.toObject() as unknown as LeanAudit);
    },

    async listAudits(ownerId, limit) {
      await ready();
      const docs = await Audit.find({ ownerId }).sort({ createdAt: -1 }).limit(limit).select("-__v").lean();
      return (docs as unknown as LeanAudit[]).map(toStored);
    },

    async getAudit(ownerId, id) {
      if (!isValidObjectId(id)) return null;
      await ready();
      const doc = await Audit.findOne({ _id: id, ownerId }).select("-__v").lean();
      return doc ? toStored(doc as unknown as LeanAudit) : null;
    },

    async deleteAudit(ownerId, id) {
      if (!isValidObjectId(id)) return false;
      await ready();
      const doc = await Audit.findOneAndDelete({ _id: id, ownerId }).lean();
      if (!doc) return false;
      const ref = (doc as unknown as LeanAudit).screenshot?.ref;
      if (ref && isValidObjectId(ref)) await Screenshot.deleteOne({ _id: ref, ownerId });
      return true;
    },

    async putScreenshot(ownerId, image) {
      await ready();
      const doc = await Screenshot.create({ ownerId, data: image.data, mimeType: image.mimeType });
      return String(doc._id);
    },

    async getScreenshot(ownerId, ref) {
      if (!isValidObjectId(ref)) return null;
      await ready();
      const doc = await Screenshot.findOne({ _id: ref, ownerId }).lean();
      if (!doc) return null;
      // .lean() returns the driver's BSON Binary, not a Node Buffer; its bytes live in `.buffer`.
      const raw = doc.data as unknown as Buffer | { buffer: Uint8Array };
      const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer);
      return { data, mimeType: doc.mimeType };
    },
  };
}
