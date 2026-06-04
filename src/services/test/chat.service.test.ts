import { beforeEach, describe, expect, it } from '@jest/globals';

const TEST_ROOM_ID = 'room-id-chat-svc-001';
const TEST_USER_ID = 'user-id-chat-svc-001';

jest.mock('../../db', () => ({
  db: {
    query: {
      chatMessages: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    select: jest.fn(),
  },
}));

import { db } from '../../db';
import { chatService } from '../chat.service';

const makeMessage = (
  id: string,
  message: string,
  secondsOffset: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  roomId: TEST_ROOM_ID,
  userId: TEST_USER_ID,
  username: 'TestUser',
  message,
  diceRoll: null,
  timestamp: new Date(Date.now() + secondsOffset * 1000),
  ...extra,
});

// select chain: from().leftJoin().where().orderBy().limit()
const makeSelectChain = (data: unknown[]) => ({
  from: jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(data),
        }),
      }),
    }),
  }),
});

beforeEach(() => {
  jest.clearAllMocks();

  (db.insert as jest.Mock).mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([makeMessage('new-msg-id', 'Hello!', 0)]),
    }),
  });

  (db.select as jest.Mock).mockReturnValue(makeSelectChain([]));
  (db.query.chatMessages.findFirst as jest.Mock).mockResolvedValue(null);
});

describe('Chat Service', () => {
  describe('saveMessage', () => {
    it('should save a message and return it', async () => {
      const saved = makeMessage('msg-id', 'Hello!', 0);
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([saved]),
        }),
      });

      const msg = await chatService.saveMessage(TEST_ROOM_ID, TEST_USER_ID, 'TestUser', 'Hello!');

      expect(msg.roomId).toBe(TEST_ROOM_ID);
      expect(msg.userId).toBe(TEST_USER_ID);
      expect(msg.username).toBe('TestUser');
      expect(msg.message).toBe('Hello!');
      expect(msg.timestamp).toBeInstanceOf(Date);
      expect(msg.id).toBeDefined();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should save a message with a dice roll', async () => {
      const diceRoll = { notation: '1d6', groups: [], modifier: 0, total: 4 };
      const saved = makeMessage('msg-id', '/roll 1d6', 0, { diceRoll });
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([saved]),
        }),
      });

      const msg = await chatService.saveMessage(
        TEST_ROOM_ID,
        TEST_USER_ID,
        'TestUser',
        '/roll 1d6',
        diceRoll
      );

      expect(msg.diceRoll).toEqual(diceRoll);
    });
  });

  describe('getRecentMessages', () => {
    it('should return messages in chronological order', async () => {
      // Service selects DESC then reverses — mock returns DESC, service reverses to ASC
      const msgsDesc = [5, 4, 3, 2, 1].map((i) => makeMessage(`msg-${i}`, `Message ${i}`, i));
      (db.select as jest.Mock).mockReturnValue(makeSelectChain(msgsDesc));

      const messages = await chatService.getRecentMessages(TEST_ROOM_ID, 10);

      expect(messages).toHaveLength(5);
      expect(messages[0].message).toBe('Message 1');
      expect(messages[4].message).toBe('Message 5');
    });

    it('should respect the limit and return the most recent', async () => {
      // With limit 3, DB returns the 3 most recent (DESC): msg5, msg4, msg3
      const msgsDesc = [5, 4, 3].map((i) => makeMessage(`msg-${i}`, `Message ${i}`, i));
      (db.select as jest.Mock).mockReturnValue(makeSelectChain(msgsDesc));

      const messages = await chatService.getRecentMessages(TEST_ROOM_ID, 3);

      expect(messages).toHaveLength(3);
      expect(messages[0].message).toBe('Message 3');
      expect(messages[2].message).toBe('Message 5');
    });

    it('should return empty array for unknown room', async () => {
      const messages = await chatService.getRecentMessages('nonexistent-room-id');
      expect(messages).toHaveLength(0);
    });
  });

  describe('getMessagesBefore', () => {
    it('should return messages before the given message id', async () => {
      const refMsg = makeMessage('ref-msg', 'Message 3', 3);
      (db.query.chatMessages.findFirst as jest.Mock).mockResolvedValue(refMsg);

      // Service queries DESC by timestamp then reverses — mock returns [msg2, msg1] in DESC
      const olderDesc = [
        makeMessage('msg-2', 'Message 2', 2),
        makeMessage('msg-1', 'Message 1', 1),
      ];
      (db.select as jest.Mock).mockReturnValue(makeSelectChain(olderDesc));

      const older = await chatService.getMessagesBefore(TEST_ROOM_ID, 'ref-msg', 10);

      expect(older).toHaveLength(2);
      expect(older[0].message).toBe('Message 1');
      expect(older[1].message).toBe('Message 2');
    });

    it('should return empty array for unknown beforeId', async () => {
      (db.query.chatMessages.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await chatService.getMessagesBefore(TEST_ROOM_ID, 'nonexistent-id', 10);
      expect(result).toHaveLength(0);
    });
  });
});
