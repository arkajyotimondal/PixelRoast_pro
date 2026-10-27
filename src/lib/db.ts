/**
 * MongoDB connection (Mongoose), cached on globalThis so dev hot-reloads and
 * concurrent requests share one pool.
 *
 * No silent fallback: if MONGODB_URI is set and the connection fails, the error
 * propagates and the request fails. Whether to use the in-memory store instead is
 * decided once, explicitly, in lib/store/index.ts.
 */
import mongoose from "mongoose";

declare global {
  var mongooseConn: Promise<typeof mongoose> | undefined;
}

export function connectDB(uri: string): Promise<typeof mongoose> {
  if (!globalThis.mongooseConn) {
    globalThis.mongooseConn = mongoose
      .connect(uri, { bufferCommands: false, maxPoolSize: 10, serverSelectionTimeoutMS: 5000 })
      .catch((err) => {
        globalThis.mongooseConn = undefined; // let the next request retry
        throw err;
      });
  }
  return globalThis.mongooseConn;
}
