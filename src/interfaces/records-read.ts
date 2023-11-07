import type { Signer } from '../types/signer.js';
import type { RecordsFilter , RecordsReadDescriptor, RecordsReadMessage } from '../types/records-types.js';

import { Message } from '../core/message.js';
import { Records } from '../utils/records.js';
import { removeUndefinedProperties } from '../utils/object.js';
import { Time } from '../utils/time.js';
import { DwnInterfaceName, DwnMethodName } from '../enums/dwn-interface-method.js';

export type RecordsReadOptions = {
  filter: RecordsFilter;
  messageTimestamp?: string;
  signer?: Signer;
  permissionsGrantId?: string;
  /**
   * Used when authorizing protocol records.
   * The protocol path to a $globalRole record whose recipient is the author of this RecordsRead
   */
  protocolRole?: string;
};

export class RecordsRead extends Message<RecordsReadMessage> {

  public static async parse(message: RecordsReadMessage): Promise<RecordsRead> {
    if (message.authorization !== undefined) {
      await Message.validateMessageSignatureIntegrity(message.authorization.signature, message.descriptor);
    }
    Time.validateTimestamp(message.descriptor.messageTimestamp);

    const recordsRead = new RecordsRead(message);
    return recordsRead;
  }

  /**
   * Creates a RecordsRead message.
   * @param options.recordId If `undefined`, will be auto-filled as a originating message as convenience for developer.
   * @param options.date If `undefined`, it will be auto-filled with current time.
   *
   * @throws {DwnError} when a combination of required RecordsReadOptions are missing
   */
  public static async create(options: RecordsReadOptions): Promise<RecordsRead> {
    const { filter, signer, permissionsGrantId, protocolRole } = options;
    const currentTime = Time.getCurrentTimestamp();

    const descriptor: RecordsReadDescriptor = {
      interface        : DwnInterfaceName.Records,
      method           : DwnMethodName.Read,
      filter           : Records.normalizeFilter(filter),
      messageTimestamp : options.messageTimestamp ?? currentTime,
    };

    removeUndefinedProperties(descriptor);

    // only generate the `authorization` property if signature input is given
    let authorization = undefined;
    if (signer !== undefined) {
      authorization = await Message.createAuthorization({
        descriptor,
        signer,
        permissionsGrantId,
        protocolRole
      });
    }
    const message: RecordsReadMessage = { descriptor, authorization };

    Message.validateJsonSchema(message);

    return new RecordsRead(message);
  }
}
