/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module IpcSocket
 */

import { IpcWebSocketMessage, ipcConnection } from "./IpcWebSocket";

function isBuffer(val: any): boolean {
  return val && typeof (val.constructor) !== "undefined" && typeof (val.constructor.isBuffer) === "function" && val.constructor.isBuffer(val);
}

let parts: any[] = [];

interface IncomingAssembly {
  partial?: string;
  received: any[];
  outstanding: number;
}

/** @internal */
export abstract class IpcWebSocketTransport {
  // Chunked-message state is per connection. A shared buffer can interleave two
  // clients' binary messages and deliver a spliced payload to the wrong one.
  private _assemblies = new Map<any, IncomingAssembly>();

  public abstract send(message: IpcWebSocketMessage): void;

  protected unwrap(data: any) {
    return (typeof (Blob) !== "undefined" && data instanceof Blob) ? data.arrayBuffer() : data;
  }

  protected async notifyIncoming(data: any, connection: any): Promise<IpcWebSocketMessage> {
    let assembly = this._assemblies.get(connection);
    if (assembly?.partial) {
      assembly.received.push(data);
      --assembly.outstanding;

      if (assembly.outstanding === 0) {
        const partial = assembly.partial;
        const received = assembly.received;
        this._assemblies.delete(connection);
        await Promise.all(received.map(async (v, i, a) => a[i] = await this.unwrap(v)));

        parts = received;
        const message: IpcWebSocketMessage = JSON.parse(partial, reviver);
        parts.length = 0;

        return InSentOrder.deliver(message, connection);
      }
      return IpcWebSocketMessage.internal();
    }

    const [serialized, followers] = JSON.parse(data);
    if (followers) {
      assembly = { partial: serialized, received: [], outstanding: followers };
      this._assemblies.set(connection, assembly);
      return IpcWebSocketMessage.internal();
    }

    const message: IpcWebSocketMessage = JSON.parse(serialized, reviver);
    return InSentOrder.deliver(message, connection);
  }

  protected serialize(data: IpcWebSocketMessage): any[] {
    parts.length = 0;
    const objects = JSON.stringify(data, replacer);
    const value = [JSON.stringify([objects, parts.length]), ...parts];
    parts.length = 0;
    return value;
  }

  protected notifyClose(connection: any) {
    this._assemblies.delete(connection);
    InSentOrder.close(connection);
  }
}

interface Marker { ipc: "binary", type: number, index: number }
const types = [Uint8Array, Int8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, DataView];
function identify(value: any) {
  return isBuffer(value) ? 0 : types.indexOf(value.constructor);
}

function lookup(value: Marker) {
  return types[value.type];
}

function replacer(this: any, _key: string, value: any) {
  const asBinary = replaceBinary(value);
  if (asBinary) {
    return asBinary;
  }

  return value;
}

function reviver(_key: string, value: any) {
  if (typeof (value) === "object" && value !== null && value.hasOwnProperty("ipc") && value.ipc === "binary") {
    return reviveBinary(value);
  }

  return value;
}

function replaceBinary(value: any): Marker | undefined {
  if (ArrayBuffer.isView(value) || isBuffer(value)) {
    const index = parts.push(value) - 1;
    const type = identify(value);
    return { ipc: "binary", type, index };
  } else {
    return undefined;
  }
}

function reviveBinary(value: Marker): ArrayBufferView {
  const constructor = lookup(value);
  const part = parts[value.index];
  return new constructor(part);
}

function makePromise<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => { };
  let reject: (reason?: any) => void = () => { };
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/* Reconstructing the sequence in which messages were sent is necessary since
   the binary data for a message has to be awaited in IpcWebSocketTransport.unwrap. */
class InSentOrder {
  private static _connections: Map<any, { queue: InSentOrder[], last: number }> = new Map();

  public static async deliver(message: IpcWebSocketMessage, connection: any): Promise<IpcWebSocketMessage> {
    let context = this._connections.get(connection);
    if (!context) {
      context = { queue: [], last: -1 };
      this._connections.set(connection, context);
    }

    const entry = new InSentOrder(message);
    context.queue.push(entry);
    context.queue.sort((a, b) => a.sequence - b.sequence);

    while (context.queue.length !== 0) {
      const next = context.queue[0];
      const duplicate = next.sequence <= context.last;
      const match = next.sequence === (context.last + 1);

      if (duplicate) {
        next.duplicate = true;
      } else if (match) {
        ++context.last;
      }

      if (duplicate || match) {
        context.queue.shift();
        next.release();
      } else {
        break;
      }
    }

    const delivered = await entry.message;
    (delivered as any)[ipcConnection] = connection;
    return delivered;
  }

  public static close(connection: any) {
    this._connections.delete(connection);
  }

  public release = () => { };
  public sequence: number;
  public duplicate = false;
  public message: Promise<IpcWebSocketMessage>;

  private constructor(message: IpcWebSocketMessage) {
    this.sequence = message.sequence;

    const { promise, resolve } = makePromise<IpcWebSocketMessage>();
    this.message = promise;

    this.release = () => {
      const value = this.duplicate ? IpcWebSocketMessage.duplicate() : message;
      resolve(value);
    };
  }
}
