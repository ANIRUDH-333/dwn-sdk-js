import type { DidResolver } from '@web5/dids';
import type { EventStream } from '../../src/types/subscriptions.js';
import type { DataStore, EventLog, MessageStore, PermissionScope, ResumableTaskStore } from '../../src/index.js';
import type { RecordEvent, RecordsWriteMessage } from '../../src/types/records-types.js';

import chaiAsPromised from 'chai-as-promised';
import emailProtocolDefinition from '../vectors/protocol-definitions/email.json' assert { type: 'json' };
import messageProtocolDefinition from '../vectors/protocol-definitions/message.json' assert { type: 'json' };
import sinon from 'sinon';
import threadRoleProtocolDefinition from '../vectors/protocol-definitions/thread-role.json' assert { type: 'json' };

import chai, { expect } from 'chai';

import { base64url } from 'multiformats/bases/base64';
import { DataStream } from '../../src/utils/data-stream.js';
import { Dwn } from '../../src/dwn.js';
import { DwnErrorCode } from '../../src/core/dwn-error.js';
import { Jws } from '../../src/utils/jws.js';
import { PermissionGrant } from '../../src/protocols/permission-grant.js';
import { Poller } from '../utils/poller.js';
import { RecordsWrite } from '../../src/interfaces/records-write.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { TestEventStream } from '../test-event-stream.js';
import { TestStores } from '../test-stores.js';
import { Time } from '../../src/utils/time.js';

import { DidKey, UniversalResolver } from '@web5/dids';
import { DwnInterfaceName, DwnMethodName, Encoder, Message, PermissionsProtocol, RecordsDelete, RecordsQuery, RecordsRead, RecordsSubscribe } from '../../src/index.js';

chai.use(chaiAsPromised);

export function testAuthorDelegatedGrant(): void {
  describe('author delegated grant', async () => {
    let didResolver: DidResolver;
    let messageStore: MessageStore;
    let dataStore: DataStore;
    let resumableTaskStore: ResumableTaskStore;
    let eventLog: EventLog;
    let eventStream: EventStream;
    let dwn: Dwn;

    // important to follow the `before` and `after` pattern to initialize and clean the stores in tests
    // so that different test suites can reuse the same backend store for testing
    before(async () => {
      didResolver = new UniversalResolver({ didResolvers: [DidKey] });

      const stores = TestStores.get();
      messageStore = stores.messageStore;
      dataStore = stores.dataStore;
      resumableTaskStore = stores.resumableTaskStore;
      eventLog = stores.eventLog;
      eventStream = TestEventStream.get();

      dwn = await Dwn.create({ didResolver, messageStore, dataStore, eventLog, eventStream, resumableTaskStore });
    });

    beforeEach(async () => {
      sinon.restore(); // wipe all previous stubs/spies/mocks/fakes

      // clean up before each test rather than after so that a test does not depend on other tests to do the clean up
      await messageStore.clear();
      await dataStore.clear();
      await resumableTaskStore.clear();
      await eventLog.clear();
    });

    after(async () => {
      await dwn.close();
    });

    describe('ProtocolsConfigure', () => {
      it('should allow author-delegated grant to configure protocols', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();
        const bob = await TestDataGenerator.generateDidKeyPersona();

        // Alice grants Bob ability to configure any protocol, bob will use it to configure the email protocol
        const scope: PermissionScope = {
          interface : DwnInterfaceName.Protocols,
          method    : DwnMethodName.Configure,
        };

        const grantToBob = await PermissionsProtocol.createGrant({
          delegated   : true, // this is a delegated grant
          dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
          description : 'Allow Bob to configure the email protocol',
          grantedTo   : bob.did,
          scope,
          signer      : Jws.createSigner(alice)
        });

        // Bob attempts to configure a protocol
        const protocolConfigure = await TestDataGenerator.generateProtocolsConfigure({
          delegatedGrant     : grantToBob.dataEncodedMessage,
          author             : bob,
          protocolDefinition : emailProtocolDefinition,
        });

        // Bob should be able to configure a protocol on behalf of alice
        const protocolConfigureReply = await dwn.processMessage(alice.did, protocolConfigure.message);
        expect(protocolConfigureReply.status.code).to.equal(202);

        // verify the protocol configure message was processed
        const protocolsQuery = await TestDataGenerator.generateProtocolsQuery({
          author : alice,
          filter : { protocol: emailProtocolDefinition.protocol }
        });

        const { status, entries } = await dwn.processMessage(alice.did, protocolsQuery.message);
        expect(status.code).to.equal(200);
        expect(entries?.length).to.equal(1);

        const fetchedProtocolConfigure = entries![0];
        expect(fetchedProtocolConfigure.descriptor.definition).to.deep.equal(emailProtocolDefinition);

        // author should be alice
        const author = Message.getAuthor(fetchedProtocolConfigure);
        expect(author).to.equal(alice.did);

        const signer = Message.getSigner(fetchedProtocolConfigure);
        expect(signer).to.equal(bob.did);
      });

      it('should allow author-delegated grant to configure a specific protocol', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();
        const bob = await TestDataGenerator.generateDidKeyPersona();

        // Alice grants Bob to configure the email protocol
        const scope: PermissionScope = {
          interface : DwnInterfaceName.Protocols,
          method    : DwnMethodName.Configure,
          protocol  : emailProtocolDefinition.protocol,
        };

        const grantToBob = await PermissionsProtocol.createGrant({
          delegated   : true, // this is a delegated grant
          dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
          description : 'Allow Bob to configure the email protocol',
          grantedTo   : bob.did,
          scope,
          signer      : Jws.createSigner(alice)
        });

        // Bob attempts to configure a protocol
        const protocolConfigure = await TestDataGenerator.generateProtocolsConfigure({
          delegatedGrant     : grantToBob.dataEncodedMessage,
          author             : bob,
          protocolDefinition : emailProtocolDefinition,
        });

        // Bob should be able to configure a protocol on behalf of alice
        const protocolConfigureReply = await dwn.processMessage(alice.did, protocolConfigure.message);
        expect(protocolConfigureReply.status.code).to.equal(202);

        // verify the protocol configure message was processed
        const protocolsQuery = await TestDataGenerator.generateProtocolsQuery({
          author : alice,
          filter : { protocol: emailProtocolDefinition.protocol }
        });

        const { status, entries } = await dwn.processMessage(alice.did, protocolsQuery.message);
        expect(status.code).to.equal(200);
        expect(entries?.length).to.equal(1);

        const fetchedProtocolConfigure = entries![0];
        expect(fetchedProtocolConfigure.descriptor.definition).to.deep.equal(emailProtocolDefinition);

        // author should be alice
        const author = Message.getAuthor(fetchedProtocolConfigure);
        expect(author).to.equal(alice.did);

        const signer = Message.getSigner(fetchedProtocolConfigure);
        expect(signer).to.equal(bob.did);

        // verify that bob cannot configure a different protocol
        const otherProtocolDefinition = {
          ...emailProtocolDefinition,
          protocol: 'https://example.com/protocol/otherProtocol'
        };

        const otherProtocolConfigure = await TestDataGenerator.generateProtocolsConfigure({
          delegatedGrant     : grantToBob.dataEncodedMessage,
          author             : bob,
          protocolDefinition : otherProtocolDefinition,
        });

        const otherProtocolConfigureReply = await dwn.processMessage(alice.did, otherProtocolConfigure.message);
        expect(otherProtocolConfigureReply.status.code).to.equal(401);
        expect(otherProtocolConfigureReply.status.detail).to.contain(DwnErrorCode.ProtocolsGrantAuthorizationScopeProtocolMismatch);
      });
    });

    describe('RecordsWrite.parse()', async () => {
      it('should throw if a message invokes a author-delegated grant (ID) but the author-delegated grant is not given', async () => {
        const alice = await TestDataGenerator.generatePersona();
        const bob = await TestDataGenerator.generatePersona();

        // Alice grants Bob to write as her for the chat protocol
        const scope: PermissionScope = {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Write,
          protocol  : 'chat'
        };
        const grantToBob = await PermissionsProtocol.createGrant({
          delegated   : true, // this is a delegated grant
          dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
          description : 'Allow Bob to write as me in chat protocol',
          grantedTo   : bob.did,
          scope,
          signer      : Jws.createSigner(alice)
        });

        // Bob creates a chat message invoking the delegated grant (ID) but does not include the author-delegated grant (we remove it below)
        const recordsWrite = await RecordsWrite.create({
          signer         : Jws.createSigner(bob),
          delegatedGrant : grantToBob.dataEncodedMessage,
          dataFormat     : 'application/octet-stream',
          data           : TestDataGenerator.randomBytes(10),
        });

        delete recordsWrite.message.authorization!.authorDelegatedGrant; // intentionally remove `authorDelegatedGrant`
        const parsePromise = RecordsWrite.parse(recordsWrite.message);

        await expect(parsePromise).to.be.rejectedWith(DwnErrorCode.RecordsAuthorDelegatedGrantAndIdExistenceMismatch);
      });

      it('should throw if a message includes an author-delegated grant but does not reference it in author signature', async () => {
        const alice = await TestDataGenerator.generatePersona();
        const bob = await TestDataGenerator.generatePersona();

        // Alice grants Bob to write as her for the chat protocol
        const scope: PermissionScope = {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Write,
          protocol  : 'chat'
        };
        const grantToBob = await PermissionsProtocol.createGrant({
          delegated   : true, // this is a delegated grant
          dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
          description : 'Allow Bob to write as me in chat protocol',
          grantedTo   : bob.did,
          scope,
          signer      : Jws.createSigner(alice)
        });

        // Bob attempts to sign as Alice by including an author-delegated grant
        // but does not reference the grant ID in author signature (we remove it below)
        const recordsWrite = await RecordsWrite.create({
          signer         : Jws.createSigner(bob),
          delegatedGrant : grantToBob.dataEncodedMessage,
          dataFormat     : 'application/octet-stream',
          data           : TestDataGenerator.randomBytes(10),
        });

        const authorSignaturePayloadCopy = { ...recordsWrite.signaturePayload };
        delete authorSignaturePayloadCopy.delegatedGrantId; // intentionally remove `delegatedGrantId` in author signature
        recordsWrite.message.authorization!.signature!.payload = Encoder.stringToBase64Url(JSON.stringify(authorSignaturePayloadCopy));
        const parsePromise = RecordsWrite.parse(recordsWrite.message);

        await expect(parsePromise).to.be.rejectedWith(DwnErrorCode.RecordsAuthorDelegatedGrantAndIdExistenceMismatch);
      });
    });

    it('should only allow correct entity invoking an author-delegated grant to write', async () => {
      // scenario:
      // 1. Alice creates a delegated grant for Device X and Device Y,
      // 2. Device X and Y can both use their grants to write a message to Bob's DWN as Alice
      // 3. Messages written by device X and Y should be considered to have been authored by Alice
      // 4. Carol should not be able to write a message as Alice using Device X's delegated grant
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const deviceY = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const carol = await TestDataGenerator.generateDidKeyPersona();

      // Bob has the message protocol installed
      const protocolDefinition = messageProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // Alice creates a delegated grant for device X and device Y
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      const deviceYGrant = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceY.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // generate a `RecordsWrite` message from device X and write to Bob's DWN
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(202);

      // verify the message by device X got written to Bob's DWN, AND Alice is the logical author
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(1);

      const fetchedDeviceXWriteEntry = bobRecordsQueryReply.entries![0];
      expect(fetchedDeviceXWriteEntry.encodedData).to.equal(base64url.baseEncode(deviceXData));

      const fetchedDeviceXWrite = await RecordsWrite.parse(fetchedDeviceXWriteEntry);
      expect(fetchedDeviceXWrite.author).to.equal(alice.did);

      // generate a new message by device Y updating the existing record device X created, and write to Bob's DWN
      const deviceYData = new TextEncoder().encode('message from device Y');
      const deviceYDataStream = DataStream.fromBytes(deviceYData);
      const messageByDeviceY = await RecordsWrite.createFrom({
        recordsWriteMessage : fetchedDeviceXWrite.message,
        data                : deviceYData,
        signer              : Jws.createSigner(deviceY),
        delegatedGrant      : deviceYGrant.dataEncodedMessage,
      });

      const deviceYWriteReply = await dwn.processMessage(bob.did, messageByDeviceY.message, { dataStream: deviceYDataStream });
      expect(deviceYWriteReply.status.code).to.equal(202);

      // verify the message by device Y got written to Bob's DWN, AND Alice is the logical author
      const bobRecordsQueryReply2 = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply2.status.code).to.equal(200);
      expect(bobRecordsQueryReply2.entries?.length).to.equal(1);

      const fetchedDeviceYWriteEntry = bobRecordsQueryReply2.entries![0];
      expect(fetchedDeviceYWriteEntry.encodedData).to.equal(base64url.baseEncode(deviceYData));

      const fetchedDeviceYWrite = await RecordsWrite.parse(fetchedDeviceYWriteEntry);
      expect(fetchedDeviceYWrite.author).to.equal(alice.did);

      // Verify that Carol cannot write a chat message as Alice by invoking the Device X's grant
      const messageByCarolAsAlice = new TextEncoder().encode('Message from Carol pretending to be Alice');
      const writeByCarolAsAlice = await RecordsWrite.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : messageByCarolAsAlice
      });

      const carolWriteReply =
        await dwn.processMessage(carol.did, writeByCarolAsAlice.message, { dataStream: DataStream.fromBytes(messageByCarolAsAlice) });
      expect(carolWriteReply.status.code).to.equal(400);
      expect(carolWriteReply.status.detail).to.contain(DwnErrorCode.RecordsAuthorDelegatedGrantGrantedToAndOwnerSignatureMismatch);
    });

    it('should only allow correct entity invoking an author-delegated grant to read and query ', async () => {
      // scenario:
      // 1. Alice creates read and query delegated grants for device X,
      // 2. Bob starts a chat thread with Alice on his DWN
      // 3. device X should be able to read the chat thread
      // 4. Carol should not be able to read the chat thread using device X's delegated grant
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const carol = await TestDataGenerator.generateDidKeyPersona();

      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocol = threadRoleProtocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, { dataStream: threadRecord.dataStream });
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Alice as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        recipient       : alice.did,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/participant',
        parentContextId : threadRecord.message.contextId,
        data            : new TextEncoder().encode('Alice is my friend'),
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, { dataStream: participantRoleRecord.dataStream });
      expect(participantRoleReply.status.code).to.equal(202);

      // Bob writes a chat message in the thread
      const chatRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/chat',
        parentContextId : threadRecord.message.contextId,
      });
      const chatRecordReply = await dwn.processMessage(bob.did, chatRecord.message, { dataStream: chatRecord.dataStream });
      expect(chatRecordReply.status.code).to.equal(202);

      // Alice creates a delegated query grant for device X to act as Alice.
      const queryGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Query,
          protocol
        },
        signer: Jws.createSigner(alice)
      });

      // Alice creates a delegated read grant for device X to act as Alice.
      const readGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Read,
          protocol
        },
        signer: Jws.createSigner(alice)
      });

      // sanity verify Bob himself is able to query for the chat thread from Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(3);

      // sanity verify Alice herself is able to query for the chat message from Bob's DWN
      const recordsQueryByAlice = await RecordsQuery.create({
        signer       : Jws.createSigner(alice),
        protocolRole : 'thread/participant',
        filter       : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const aliceRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByAlice.message);
      expect(aliceRecordsQueryReply.status.code).to.equal(200);
      expect(aliceRecordsQueryReply.entries?.length).to.equal(1);

      // verify device X is able to query for the chat message from Bob's DWN
      const recordsQueryByDeviceX = await RecordsQuery.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : queryGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const deviceXRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByDeviceX.message);
      expect(deviceXRecordsQueryReply.status.code).to.equal(200);
      expect(deviceXRecordsQueryReply.entries?.length).to.equal(1);

      // verify device X is able to read the chat message from Bob's DWN
      const recordsReadByDeviceX = await RecordsRead.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : readGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          recordId: chatRecord.message.recordId
        }
      });
      const deviceXRecordsReadReply = await dwn.processMessage(bob.did, recordsReadByDeviceX.message);
      expect(deviceXRecordsReadReply.status.code).to.equal(200);
      expect(deviceXRecordsReadReply.record?.recordId).to.equal(chatRecord.message.recordId);

      // Verify that Carol cannot query as Alice by invoking the delegated grant granted to Device X
      const recordsQueryByCarol = await RecordsQuery.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : readGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const recordsQueryByCarolReply = await dwn.processMessage(bob.did, recordsQueryByCarol.message);
      expect(recordsQueryByCarolReply.status.code).to.equal(400);
      expect(recordsQueryByCarolReply.status.detail).to.contain(DwnErrorCode.RecordsAuthorDelegatedGrantGrantedToAndOwnerSignatureMismatch);

      // Verify that Carol cannot read as Alice by invoking the delegated grant granted to Device X
      const recordsReadByCarol = await RecordsRead.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : readGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          recordId: chatRecord.message.recordId
        }
      });
      const recordsReadByCarolReply = await dwn.processMessage(bob.did, recordsReadByCarol.message);
      expect(recordsReadByCarolReply.status.code).to.equal(400);
      expect(recordsQueryByCarolReply.status.detail).to.contain(DwnErrorCode.RecordsAuthorDelegatedGrantGrantedToAndOwnerSignatureMismatch);
    });

    it('should only allow correct entity invoking an author-delegated grant to subscribe', async () => {
      // scenario:
      // 1. Bob installs a chat protocol and creates a thread, adding Alice as a participant.
      // 2. Alice a creates subscribe delegated grant for device X,
      // 3. Carol should not be able to subscribe to the chat using deviceX's delegated grant.
      // 4. deviceX creates a subscription to receive events using the delegated grant.
      // 5. Bob writes two chat messages to the thread.
      // 6. The subscription should have received the chat messages.
      // 7. Bob deletes one of the chat messages.
      // 8. The subscription should have received the delete event.

      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const carol = await TestDataGenerator.generateDidKeyPersona();


      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocol = threadRoleProtocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, { dataStream: threadRecord.dataStream });
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Alice as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        recipient       : alice.did,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/participant',
        parentContextId : threadRecord.message.contextId,
        data            : new TextEncoder().encode('Alice is my friend'),
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, { dataStream: participantRoleRecord.dataStream });
      expect(participantRoleReply.status.code).to.equal(202);

      // Alice creates a delegated subscribe grant for device X to act as Alice.
      const subscribeGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Subscribe,
          protocol
        },
        signer: Jws.createSigner(alice)
      });

      // Create a handler to set or delete the chat record ID in the subscription set depending on the interface method
      const subscriptionChatRecords:Set<string> = new Set();
      const captureChatRecords = async (event: RecordEvent): Promise<void> => {
        const { message } = event;
        if (message.descriptor.method === DwnMethodName.Delete) {
          const recordId = message.descriptor.recordId;
          subscriptionChatRecords.delete(recordId);
        } else {
          const recordId = (message as RecordsWriteMessage).recordId;
          subscriptionChatRecords.add(recordId);
        }
      };

      // control: verify that device X cannot subscribe to the chat thread without the delegated grant
      const recordsSubscribeByDeviceXWithoutGrant = await RecordsSubscribe.create({
        signer       : Jws.createSigner(deviceX),
        protocolRole : 'thread/participant',
        filter       : {
          contextId    : threadRecord.message.contextId,
          protocol     : protocolDefinition.protocol,
          protocolPath : 'thread/chat'
        }
      });
      const recordsSubscribeByDeviceXWithoutGrantReply = await dwn.processMessage(bob.did, recordsSubscribeByDeviceXWithoutGrant.message);
      expect(recordsSubscribeByDeviceXWithoutGrantReply.status.code).to.equal(401, 'device X without grant subscribe');

      // control: verify that Carol cannot subscribe as Alice by invoking the delegated grant granted to Device X
      const recordsSubscribeByCarol = await RecordsSubscribe.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : subscribeGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          contextId    : threadRecord.message.contextId,
          protocol     : protocolDefinition.protocol,
          protocolPath : 'thread/chat'
        }
      });
      const recordsSubscribeByCarolReply = await dwn.processMessage(bob.did, recordsSubscribeByCarol.message);
      expect(recordsSubscribeByCarolReply.status.code).to.equal(400, 'carol subscribe');
      expect(recordsSubscribeByCarolReply.status.detail).to.contain(DwnErrorCode.RecordsAuthorDelegatedGrantGrantedToAndOwnerSignatureMismatch);

      // verify device X is able to subscribe the chat message from Bob's DWN using the delegated grant
      const recordsSubscribeByDeviceX = await RecordsSubscribe.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : subscribeGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          contextId    : threadRecord.message.contextId,
          protocol     : protocolDefinition.protocol,
          protocolPath : 'thread/chat'
        }
      });
      const recordsSubscribeByDeviceXReply = await dwn.processMessage(bob.did, recordsSubscribeByDeviceX.message, {
        subscriptionHandler: captureChatRecords
      });
      expect(recordsSubscribeByDeviceXReply.status.code).to.equal(200, 'subscribe');

      // Bob writes chat messages in the thread
      const chatRecord1 = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/chat',
        parentContextId : threadRecord.message.contextId,
      });
      const chatRecord1Reply = await dwn.processMessage(bob.did, chatRecord1.message, { dataStream: chatRecord1.dataStream });
      expect(chatRecord1Reply.status.code).to.equal(202);

      const chatRecord2 = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/chat',
        parentContextId : threadRecord.message.contextId,
      });
      const chatRecord2Reply = await dwn.processMessage(bob.did, chatRecord2.message, { dataStream: chatRecord2.dataStream });
      expect(chatRecord2Reply.status.code).to.equal(202);

      await Poller.pollUntilSuccessOrTimeout(async () => {
        expect(subscriptionChatRecords.size).to.equal(2);
        expect([ ...subscriptionChatRecords ]).to.have.members([ chatRecord1.message.recordId, chatRecord2.message.recordId ]);
      });

      await recordsSubscribeByDeviceXReply.subscription?.close();
    });

    it('should only allow correct entity invoking an author-delegated grant to delete', async () => {
      // scenario:
      // 1. Bob installs the chat protocol on his DWN and makes Alice an admin
      // 2. Bob starts a chat thread with Carol on his DWN
      // 3. Alice creates a delegated grant for Device X to act as her
      // 4. Carol should not be able to delete a chat message as Alice using Device X's delegated grant
      // 5. Device X should be able to delete a chat message as Alice
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const carol = await TestDataGenerator.generateDidKeyPersona();

      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocol = threadRoleProtocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob adds Alice as an admin
      const globalAdminRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        recipient    : alice.did,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'globalAdmin',
        data         : new TextEncoder().encode('I trust Alice to manage my chat thread'),
      });
      const globalAdminRecordReply = await dwn.processMessage(bob.did, globalAdminRecord.message, { dataStream: globalAdminRecord.dataStream });
      expect(globalAdminRecordReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, { dataStream: threadRecord.dataStream });
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Carol as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        recipient       : carol.did,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/participant',
        parentContextId : threadRecord.message.contextId
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, { dataStream: participantRoleRecord.dataStream });
      expect(participantRoleReply.status.code).to.equal(202);

      // Carol writes a chat message in the thread
      const chatRecord = await TestDataGenerator.generateRecordsWrite({
        author          : carol,
        protocolRole    : 'thread/participant',
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/chat',
        parentContextId : threadRecord.message.contextId,
        data            : new TextEncoder().encode('A rude message'),
      });
      const chatRecordReply = await dwn.processMessage(bob.did, chatRecord.message, { dataStream: chatRecord.dataStream });
      expect(chatRecordReply.status.code).to.equal(202);

      // Alice creates a delegated delete grant for device X to act as Alice.
      const deleteGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Delete,
          protocol
        },
        signer: Jws.createSigner(alice)
      });

      // verify Carol is not able to delete Carol's chat message from Bob's DWN
      const recordsDeleteByCarol = await RecordsDelete.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : deleteGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        recordId       : chatRecord.message.recordId
      });
      const carolRecordsDeleteReply = await dwn.processMessage(bob.did, recordsDeleteByCarol.message);
      expect(carolRecordsDeleteReply.status.code).to.equal(400);

      // sanity verify the chat message is still in Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocolPath: 'thread/chat' }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(1);

      // verify device X is able to delete Carol's chat message from Bob's DWN
      const recordsDeleteByDeviceX = await RecordsDelete.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deleteGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'globalAdmin',
        recordId       : chatRecord.message.recordId
      });
      const deviceXRecordsDeleteReply = await dwn.processMessage(bob.did, recordsDeleteByDeviceX.message);
      expect(deviceXRecordsDeleteReply.status.code).to.equal(202);

      // sanity verify the chat message is no longer queryable from Bob's DWN
      const bobRecordsQueryReply2 = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply2.status.code).to.equal(200);
      expect(bobRecordsQueryReply2.entries?.length).to.equal(0);
    });

    it('should not allow entity using a non-delegated grant as an author-delegated grant to invoke write', async () => {
      // scenario:
      // 1. Bob has the message protocol installed
      // 2. Alice creates a non-delegated grant for device X
      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using the non-delegated grant
      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();

      // 1. Bob has the message protocol installed
      const protocolDefinition = messageProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // 2. Alice creates a non-delegated grant for device X
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        // delegated   : true, // intentionally commented out to show that this is not a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using the non-delegated grant
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(400);
      expect(deviceXWriteReply.status.detail).to.contain(DwnErrorCode.RecordsAuthorDelegatedGrantNotADelegatedGrant);

      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(0);
    });

    xit('should not allow entity using a non-delegated grant as an author-delegated grant to invoke read', async () => {
    });

    xit('should not allow entity using a non-delegated grant as an author-delegated grant to invoke query', async () => {
    });

    xit('should not allow entity using a non-delegated grant as an author-delegated grant to invoke delete', async () => {
    });

    it('should fail if author-delegated grant has a mismatching protocol scope - write', async () => {
      // scenario:
      // 1. Alice creates a delegated grant for device X to act as her for a protocol that is NOT email protocol
      // 2. Bob has email protocol configured for his DWN that allows anyone to write an email to him
      // 3. Device X attempts to use the delegated grant to write an email to Bob as Alice
      // 4. Bob's DWN should reject Device X's message
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();

      // 1. Alice creates a delegated grant for device X to act as her for a protocol that is NOT email protocol
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol  : 'random-protocol'
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // 2. Bob has email protocol configured for his DWN that allows anyone to write an email to him
      const protocolDefinition = emailProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // 3. Device X attempts to use the delegated grant to write an email to Bob as Alice
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'email', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.email.schema,
        dataFormat     : protocolDefinition.types.email.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(401);
      expect(deviceXWriteReply.status.detail).to.contain(DwnErrorCode.RecordsGrantAuthorizationScopeProtocolMismatch);
    });

    it('should fail if author-delegated grant has a mismatching protocol scope - query, subscribe & read', async () => {
      // scenario:
      // 1. Bob starts a chat thread with Alice on his DWN
      // 2. Alice creates a delegated grant for device X to act as her for a protocol that is NOT chat protocol
      // 3. Device X attempts to use the delegated grant to read, query and subscribe to the chat thread and gets rejected by Bob's DWN

      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();

      // 1. Bob starts a chat thread with Alice on his DWN

      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocol = threadRoleProtocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, { dataStream: threadRecord.dataStream });
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Alice as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        recipient       : alice.did,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/participant',
        parentContextId : threadRecord.message.contextId,
        data            : new TextEncoder().encode('Alice is my friend'),
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, { dataStream: participantRoleRecord.dataStream });
      expect(participantRoleReply.status.code).to.equal(202);

      // Bob writes a chat message in the thread
      const chatRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/chat',
        parentContextId : threadRecord.message.contextId,
      });
      const chatRecordReply = await dwn.processMessage(bob.did, chatRecord.message, { dataStream: chatRecord.dataStream });
      expect(chatRecordReply.status.code).to.equal(202);


      // 2. Alice creates a delegated grant for device X to act as her for a protocol that is NOT chat protocol

      // Alice creates a delegated query grant for device X to act as Alice but not for chat protocol
      const queryGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Query,
          protocol  : 'some-other-protocol'
        },
        signer: Jws.createSigner(alice)
      });

      // Alice creates a delegated read grant for device X to act as Alice but not for chat protocol
      const readGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Read,
          protocol  : 'some-other-protocol'
        },
        signer: Jws.createSigner(alice)
      });

      // Alice creates a delegated subscribe grant for device X to act as Alice but not for chat protocol
      const subscribeGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Subscribe,
          protocol  : 'some-other-protocol'
        },
        signer: Jws.createSigner(alice)
      });


      // 3. Device X attempts to use the delegated grant to read, query and subscribe to the chat thread and gets rejected by Bob's DWN

      // verify device X querying for the chat message from Bob's DWN fails
      const recordsQueryByDeviceX = await RecordsQuery.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : queryGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const deviceXRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByDeviceX.message);
      expect(deviceXRecordsQueryReply.status.code).to.equal(401);
      expect(deviceXRecordsQueryReply.status.detail).to.contain(DwnErrorCode.RecordsGrantAuthorizationQueryOrSubscribeProtocolScopeMismatch);

      // verify device X reading for the chat message from Bob's DWN fails
      const recordsReadByDeviceX = await RecordsRead.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : readGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          recordId: chatRecord.message.recordId
        }
      });
      const deviceXReadReply = await dwn.processMessage(bob.did, recordsReadByDeviceX.message);
      expect(deviceXReadReply.status.code).to.equal(401);
      expect(deviceXReadReply.status.detail).to.contain(DwnErrorCode.RecordsGrantAuthorizationScopeProtocolMismatch);

      // verify device X subscribing to the chat message from Bob's DWN fails
      const recordsSubscribeByDeviceX = await RecordsSubscribe.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : subscribeGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'thread/participant',
        filter         : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const deviceXRecordsSubscribeReply = await dwn.processMessage(bob.did, recordsSubscribeByDeviceX.message);
      expect(deviceXRecordsSubscribeReply.status.code).to.equal(401);
      expect(deviceXRecordsSubscribeReply.status.detail).to.contain(DwnErrorCode.RecordsGrantAuthorizationQueryOrSubscribeProtocolScopeMismatch);
    });

    it('should fail if author-delegated grant has a mismatching protocol scope - delete', async () => {
      // scenario:
      // 1. Bob installs the chat protocol on his DWN and makes Alice an admin
      // 2. Bob starts a chat thread with Carol on his DWN
      // 3. Alice creates a delegated delete grant for Device X to act as her for a protocol that is NOT chat protocol
      // 4. Device X should NOT be able to delete a chat message as Alice
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const carol = await TestDataGenerator.generateDidKeyPersona();

      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob adds Alice as an admin
      const globalAdminRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        recipient    : alice.did,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'globalAdmin',
        data         : new TextEncoder().encode('I trust Alice to manage my chat thread'),
      });
      const globalAdminRecordReply = await dwn.processMessage(bob.did, globalAdminRecord.message, { dataStream: globalAdminRecord.dataStream });
      expect(globalAdminRecordReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, { dataStream: threadRecord.dataStream });
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Carol as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author          : bob,
        recipient       : carol.did,
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/participant',
        parentContextId : threadRecord.message.contextId
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, { dataStream: participantRoleRecord.dataStream });
      expect(participantRoleReply.status.code).to.equal(202);

      // Carol writes a chat message in the thread
      const chatRecord = await TestDataGenerator.generateRecordsWrite({
        author          : carol,
        protocolRole    : 'thread/participant',
        protocol        : protocolDefinition.protocol,
        protocolPath    : 'thread/chat',
        parentContextId : threadRecord.message.contextId,
        data            : new TextEncoder().encode('A rude message'),
      });
      const chatRecordReply = await dwn.processMessage(bob.did, chatRecord.message, { dataStream: chatRecord.dataStream });
      expect(chatRecordReply.status.code).to.equal(202);

      // Alice creates a delegated delete grant for Device X to act as her for a protocol that is NOT chat protocol
      const delegatedGrantForDeviceX = await PermissionsProtocol.createGrant({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : {
          interface : DwnInterfaceName.Records,
          method    : DwnMethodName.Delete,
          protocol  : 'some-protocol-that-is-not-chat'
        },
        signer: Jws.createSigner(alice)
      });

      // verify device X is NOT able to delete Carol's chat message from Bob's DWN
      const recordsDeleteByDeviceX = await RecordsDelete.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : delegatedGrantForDeviceX.dataEncodedMessage,
        protocolRole   : 'globalAdmin',
        recordId       : chatRecord.message.recordId
      });
      const deviceXRecordsDeleteReply = await dwn.processMessage(bob.did, recordsDeleteByDeviceX.message);
      expect(deviceXRecordsDeleteReply.status.code).to.equal(401);
      expect(deviceXRecordsDeleteReply.status.detail).to.contain(DwnErrorCode.RecordsGrantAuthorizationDeleteProtocolScopeMismatch);

      // sanity verify the chat message is still in Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocolPath: 'thread/chat' }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(1);
    });

    it('should fail if presented with an author-delegated grant with invalid grantor signature - write', async () => {
      // scenario:
      // 1. Bob has the message protocol installed
      // 2. Alice creates a delegated grant for device X to write as Alice, but with invalid signature
      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using the delegated grant with invalid grantor signature
      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();

      // 1. Bob has the message protocol installed
      const protocolDefinition = messageProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // 2. Alice creates a delegated grant for device X to write as Alice, but with invalid signature
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        delegated   : true,
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      const deviceXGrantMessage = deviceXGrant.dataEncodedMessage;
      deviceXGrantMessage.authorization.signature.signatures[0].signature = await TestDataGenerator.randomSignatureString();

      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using the delegated grant with invalid grantor signature
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrantMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(401);
      expect(deviceXWriteReply.status.detail).to.contain(DwnErrorCode.GeneralJwsVerifierInvalidSignature);

      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(0);
    });

    it('should fail if the CID of the author-delegated grant and the grant ID in the payload of the message signature is mismatching - write', async () => {
      // scenario:
      // 1. Bob has the message protocol installed
      // 2. Alice creates two delegated grants for device X to write as Alice
      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using a mismatching delegated grant ID
      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();

      // 1. Bob has the message protocol installed
      const protocolDefinition = messageProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // 2. Alice creates two delegated grants for device X to write as Alice
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        delegated   : true,
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      await Time.minimalSleep();

      const deviceXGrant2 = await PermissionsProtocol.createGrant({
        delegated   : true,
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using a mismatching delegated grant ID
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : deviceXData
      });

      messageByDeviceX.message.authorization.authorDelegatedGrant = deviceXGrant2.dataEncodedMessage; // intentionally have a mismatching grant

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(400);
      expect(deviceXWriteReply.status.detail).to.contain(DwnErrorCode.RecordsAuthorDelegatedGrantCidMismatch);

      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(0);
    });

    it('should fail if author-delegated grant is revoked - write', async () => {
      // scenario:
      // 1. Bob has the message protocol installed
      // 2. Alice creates a delegated grant for device X to write as Alice
      // 3. Alice revokes the grant
      // 4. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using a revoked delegated grant
      // 5. Sanity verify the message by device X did not get written to Bob's DWN
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();

      // 1. Bob has the message protocol installed
      const protocolDefinition = messageProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // 2. Alice creates a delegated grant for device X to write as Alice
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        delegated   : true,
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });
      const deviceXGrantDataStream = DataStream.fromBytes(deviceXGrant.permissionGrantBytes);
      const permissionGrantWriteReply = await dwn.processMessage(
        alice.did,
        deviceXGrant.recordsWrite.message,
        { dataStream: deviceXGrantDataStream }
      );
      expect(permissionGrantWriteReply.status.code).to.equal(202);

      // 3. Alice revokes the grant
      const permissionRevoke = await PermissionsProtocol.createRevocation({
        signer : Jws.createSigner(alice),
        grant  : await PermissionGrant.parse(deviceXGrant.dataEncodedMessage),
      });
      const revocationDataStream = DataStream.fromBytes(permissionRevoke.permissionRevocationBytes);
      const permissionRevokeReply = await dwn.processMessage(alice.did, permissionRevoke.recordsWrite.message, { dataStream: revocationDataStream });
      expect(permissionRevokeReply.status.code).to.equal(202);

      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using a mismatching delegated grant ID
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(401);
      expect(deviceXWriteReply.status.detail).to.contain(DwnErrorCode.GrantAuthorizationGrantRevoked);

      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(0);
    });

    it('should fail if author-delegated grant is expired - write', async () => {
      // scenario:
      // 1. Bob has the message protocol installed
      // 2. Alice creates a delegated grant for device X to write as Alice, but make it expired
      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using an expired delegated grant
      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const deviceX = await TestDataGenerator.generateDidKeyPersona();

      // 1. Bob has the message protocol installed
      const protocolDefinition = messageProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // 2. Alice creates a delegated grant for device X to write as Alice, but make it expired
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsProtocol.createGrant({
        delegated   : true,
        dateExpires : Time.getCurrentTimestamp(), // intentionally set to current time to make it expired immediately
        grantedTo   : deviceX.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // 3. Verify that device X cannot write a `RecordsWrite` message to Bob's DWN as Alice using an expired delegated grant
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.dataEncodedMessage,
        protocol,
        protocolPath   : 'message', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.message.schema,
        dataFormat     : protocolDefinition.types.message.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, { dataStream: deviceXDataStream });
      expect(deviceXWriteReply.status.code).to.equal(401);
      expect(deviceXWriteReply.status.detail).to.contain(DwnErrorCode.GrantAuthorizationGrantExpired);

      // 4. Sanity verify the message by device X did not get written to Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(0);
    });
  });
}
